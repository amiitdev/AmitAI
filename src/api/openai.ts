import { Message } from '../types';
import { Source } from './tools';
import { recordSent, recordBlocked } from '../lib/quota';

export interface ChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: Message[];
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
  simulate429?: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

/** ~4 chars per token is close enough for a live counter. */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const trimBase = (baseUrl: string) => baseUrl.replace(/\/+$/, '');

/** Turn a 429 into something actionable: which model, how many, how long. */
export function explain429(raw: string): string {
  const lim = raw.match(/limit: (\d+), model: ([\w.-]+)/i);
  const mins = (() => {
    const m = raw.match(/retry in (?:\d+h)?(?:\d+m)?([\d.]+)s/i) ?? raw.match(/retry in (\d+)m/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return v > 60 ? `${Math.ceil(v / 60)} min` : `${Math.ceil(v)} s`;
  })();
  if (lim) {
    return (
      `Quota used up: ${lim[1]} requests/day on ${lim[2]}. ` +
      (mins ? `Resets in ~${mins}. ` : '') +
      'Switch to gemini-2.5-flash-lite (separate quota) in the model picker.'
    );
  }
  return raw.slice(0, 200) || 'Rate limited — try again shortly.';
}


/* ------------------------------ wire format ------------------------------ */

type WireMsg =
  | { role: 'system' | 'user'; content: any }
  | { role: 'assistant'; content: any; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: any };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ExecuteResult {
  content: string;
  sources?: Source[];
}

/**
 * Message → wire format. Exported for the multi-image test: the attachment
 * shape (text part + N image parts) is the whole contract with vision models.
 */
export function toWire(messages: Message[], systemPrompt: string): WireMsg[] {
  const out: WireMsg[] = [];
  if (systemPrompt.trim()) out.push({ role: 'system', content: systemPrompt.trim() });
  for (const m of messages) {
    if (m.role === 'system') continue;
    // 1-8 images since 3.7; the single-image fields are kept so old stored
    // conversations still render and still send.
    const images = m.imageDatas?.length ? m.imageDatas : m.imageData ? [m.imageData] : [];
    if (images.length) {
      out.push({
        role: m.role as 'user',
        content: [
          { type: 'text', text: m.content || 'Describe these images.' },
          ...images.slice(0, 8).map(url => ({ type: 'image_url', image_url: { url } })),
        ],
      });
      continue;
    }
    if (!m.content.trim()) continue;
    out.push({ role: m.role as 'user' | 'assistant', content: m.content });
  }
  return out;
}

/* -------------------------------- one call ------------------------------- */

interface StreamResult {
  text: string;
  toolCalls: ToolCall[];
}

/**
 * Single request, streamed over XHR+SSE.
 *
 * React Native's fetch cannot expose a response body stream, so we read
 * `xhr.responseText` growth through onprogress. Tool calls arrive as fragments
 * keyed by `index` and have to be reassembled across chunks.
 */
function streamOnce(
  opts: {
    baseUrl: string;
    apiKey: string;
    model: string;
    wire: WireMsg[];
    temperature: number;
    maxTokens: number;
    stream: boolean;
    reasoningEffort?: string;
    tools?: ToolDef[];
    simulate429?: boolean;
  },
  onDelta: (t: string) => void,
  registerAbort: (fn: () => void) => void,
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let seen = 0;
    let carry = '';
    let text = '';
    const calls: ToolCall[] = [];
    let settled = false;

    const done = (r: StreamResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      reject(e);
    };

    const body: any = {
      model: opts.model,
      messages: opts.wire,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: opts.stream,
    };
    if (opts.reasoningEffort && opts.reasoningEffort !== 'off') {
      body.reasoning_effort = opts.reasoningEffort;
    }
    if (opts.tools?.length) {
      body.tools = opts.tools;
      body.tool_choice = 'auto';
    }

    if (opts.simulate429) {
      const raw =
        'You exceeded your current quota, please check your plan and billing details. ' +
        '* Quota exceeded for metric: generativelanguage.googleapis.com/' +
        'generate_content_free_tier_requests, limit: 20, model: ' +
        opts.model +
        '. Please retry in 30m48.812s.';
      recordSent(opts.model).catch(() => {});
      recordBlocked(opts.model, raw)
        .catch(() => {})
        .finally(() => fail(new ApiError(explain429(raw), 429)));
      return;
    }

    xhr.open('POST', `${trimBase(opts.baseUrl)}/chat/completions`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (opts.apiKey) xhr.setRequestHeader('Authorization', `Bearer ${opts.apiKey}`);
    xhr.setRequestHeader('Accept', opts.stream ? 'text/event-stream' : 'application/json');
    xhr.timeout = FIRST_TOKEN_MS;
    registerAbort(() => xhr.abort());

    const mergeToolDelta = (tc: any) => {
      const idx = typeof tc.index === 'number' ? tc.index : calls.length;
      if (!calls[idx]) {
        calls[idx] = {
          id: tc.id ?? `call_${idx}`,
          type: 'function',
          function: { name: '', arguments: '' },
        };
      }
      if (tc.id) calls[idx].id = tc.id;
      if (tc.function?.name) calls[idx].function.name += tc.function.name;
      if (tc.function?.arguments) calls[idx].function.arguments += tc.function.arguments;
    };

    const parseEvent = (payload: string) => {
      if (payload === '[DONE]') return done({ text, toolCalls: calls.filter(Boolean) });
      let json: any;
      try {
        json = JSON.parse(payload);
      } catch {
        return;
      }
      if (json.error) return fail(new ApiError(json.error.message || 'API error'));

      const choice = json.choices?.[0];
      if (!choice) return;

      const delta = choice.delta ?? choice.message ?? {};
      if (typeof delta.content === 'string' && delta.content) {
        text += delta.content;
        onDelta(delta.content);
      }
      if (Array.isArray(delta.tool_calls)) delta.tool_calls.forEach(mergeToolDelta);

      if (choice.finish_reason) {
        done({ text, toolCalls: calls.filter(c => c && c.function.name) });
      }
    };

    const drain = () => {
      const full: string = xhr.responseText || '';
      if (full.length <= seen) return;
      const slice = full.slice(seen);
      seen = full.length;
      if (!opts.stream) return;

      const parts = (carry + slice).split(/\r?\n/);
      carry = parts.pop() ?? '';
      for (const line of parts) {
        const t = line.trim();
        if (!t || t.startsWith(':')) continue;
        if (t.startsWith('data:')) parseEvent(t.slice(5).trim());
      }
    };

    xhr.onprogress = drain;

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let msg = `HTTP ${xhr.status}`;
        try {
          msg = JSON.parse(xhr.responseText)?.error?.message || msg;
        } catch {
          msg = `${msg}: ${(xhr.responseText || '').slice(0, 180)}`;
        }
        if (xhr.status === 429) msg = explain429(msg);
        return fail(new ApiError(msg, xhr.status));
      }

      if (opts.stream) {
        drain();
        if (carry.trim().startsWith('data:')) parseEvent(carry.trim().slice(5).trim());
        return done({ text, toolCalls: calls.filter(c => c && c.function.name) });
      }

      try {
        const j = JSON.parse(xhr.responseText);
        const msg = j.choices?.[0]?.message ?? {};
        if (typeof msg.content === 'string' && msg.content) {
          text = msg.content;
          onDelta(text);
        }
        (msg.tool_calls ?? []).forEach(mergeToolDelta);
        done({ text, toolCalls: calls.filter(c => c && c.function.name) });
      } catch (e: any) {
        fail(new ApiError('Could not parse response: ' + e.message));
      }
    };

    xhr.onerror = () => fail(new ApiError('Network error — check the base URL and connection.'));
    xhr.ontimeout = () => fail(new ApiError('Request timed out after 3 minutes.'));
    xhr.onabort = () => fail(new ApiError('Stopped', -1));

    xhr.send(JSON.stringify(body));
  });
}

/* ------------------------------- agent loop ------------------------------ */

export interface AgentOptions extends ChatRequest {
  tools?: ToolDef[];
  maxRounds?: number;
  execute?: (name: string, args: any) => Promise<ExecuteResult>;
}

export interface AgentHandlers {
  onDelta: (t: string) => void;
  onToolStart?: (name: string, args: any) => void;
  onToolDone?: (name: string, ok: boolean, summary: string) => void;
  onSources?: (sources: Source[]) => void;
  /** fires once with the final answer text */
  onDone?: (text: string) => void;
  onError?: (err: Error) => void;
}

export interface RunHandle {
  stop: () => void;
}

/**
 * Runs the model, executing any tools it asks for, up to `maxRounds`.
 *
 * Round 1: model sees the question and the tool list. If it answers directly
 * we are done. If it returns tool_calls, we run them locally, append the
 * results as `role:"tool"` messages and ask again — the model then answers
 * with the real data in context.
 */
export function runAgent(opts: AgentOptions, handlers: AgentHandlers): RunHandle {
  let aborted = false;
  let abortCurrent: (() => void) | null = null;

  const stop = () => {
    aborted = true;
    abortCurrent?.();
  };

  (async () => {
    const wire = toWire(opts.messages, opts.systemPrompt);
    const sources: Source[] = [];
    const maxRounds = opts.maxRounds ?? 3;

    for (let round = 0; round < maxRounds; round++) {
      const result = await streamOnce(
        {
          baseUrl: opts.baseUrl,
          apiKey: opts.apiKey,
          model: opts.model,
          wire,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
          stream: opts.stream,
          reasoningEffort: opts.reasoningEffort,
          simulate429: opts.simulate429,
          tools: opts.tools,
        },
        handlers.onDelta,
        fn => {
          abortCurrent = fn;
        },
      );

      if (aborted) return;

      if (!result.toolCalls.length || !opts.execute) {
        handlers.onSources?.(sources);
        handlers.onDone?.(result.text);
        return; // final answer
      }

      // model wants tools: record the call, run each, feed results back
      wire.push({
        role: 'assistant',
        content: result.text || null,
        tool_calls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        let args: any = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }

        handlers.onToolStart?.(call.function.name, args);

        let content: string;
        try {
          const out = await opts.execute(call.function.name, args);
          content = out.content;
          if (out.sources?.length) {
            for (const s of out.sources) {
              if (!sources.some(x => x.url === s.url)) sources.push(s);
            }
          }
          handlers.onToolDone?.(call.function.name, true, content.slice(0, 90));
        } catch (e: any) {
          content = `Tool failed: ${e?.message ?? 'unknown error'}`;
          handlers.onToolDone?.(call.function.name, false, content);
        }
        if (aborted) return;

        wire.push({ role: 'tool', tool_call_id: call.id, content });
      }
    }

    // ran out of rounds without a plain answer: return what we have
    handlers.onSources?.(sources);
    handlers.onDone?.('');
  })().catch(err => {
    if (aborted || err?.status === -1) return;
    handlers.onError?.(err);
  });

  return { stop };
}

/* -------------------------------- extras -------------------------------- */

/** Cheap connectivity + auth check for the settings screen. */
export async function ping(baseUrl: string, apiKey: string): Promise<string[]> {
  const res = await fetch(`${trimBase(baseUrl)}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });
  if (!res.ok) throw new ApiError(`HTTP ${res.status} ${res.statusText}`, res.status);
  const j = await res.json();
  const ids: string[] = (j.data || []).map((m: any) => String(m.id).replace(/^models\//, ''));
  return ids.sort();
}

/** Read a local file:// uri into a data: URL so vision models can see it. */
export function fileToDataUrl(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', uri, true);
    xhr.responseType = 'blob';
    xhr.onload = () => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.readAsDataURL(xhr.response);
    };
    xhr.onerror = () => reject(new Error('Could not open image'));
    xhr.send();
  });
}

// Real OpenAI reasoning models delay the first token (chain-of-thought); without a timeout the UI spins.
const FIRST_TOKEN_MS = 240_000;
