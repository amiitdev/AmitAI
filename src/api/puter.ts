/**
 * Puter transport — the free, keyless-in-spirit AI route.
 *
 * Puter.js itself is a browser SDK: it authenticates with a browser popup and
 * identifies your app by its origin. React Native has neither, so this module
 * speaks the same HTTP API the SDK compiles down to:
 *
 *   POST https://api.puter.com/drivers/call
 *   Authorization: Bearer <token>
 *   { "interface": "puter-chat-completion", "driver": "ai-chat",
 *     "method": "complete", "args": { messages, model, ... } }
 *
 * Answers come back either as one JSON envelope
 * (`{ success, result: { message, usage } }`) or, with `stream: true`, as
 * newline-delimited JSON chunks (`{ type: "text", text }`, a final
 * `{ type: "usage", ... }`, and `{ type: "error" }` if the upstream failed).
 *
 * Why not the OpenAI-compatible `/puterai/openai/v1/chat/completions` route we
 * would otherwise prefer? It is gated behind `requireSubscription`, so a free
 * account gets 402 there. `/drivers/call` is the route the free plan uses.
 *
 * The token is a normal Puter session token — the same one `puter login`
 * stores. It is per-account, not per-app, and Puter bills the account's own
 * free allowance, which is exactly the "user-pays" model.
 */

const API_ORIGIN = 'https://api.puter.com';
const CALL_URL = `${API_ORIGIN}/drivers/call`;
const MODELS_URL = `${API_ORIGIN}/puterai/chat/models`;

/** OpenAI-style tool definition, identical to the one the app already builds. */
export interface PuterTool {
  type: 'function';
  function: { name: string; description: string; parameters: any };
}

export interface PuterToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface PuterWireMsg {
  role: string;
  content: any;
  tool_calls?: PuterToolCall[];
  tool_call_id?: string;
}

export interface PuterCallOptions {
  token: string;
  model: string;
  wire: PuterWireMsg[];
  temperature: number;
  maxTokens: number;
  stream: boolean;
  /** 1 = chat only, 3 = the agent loop (same meaning as elsewhere) */
  reasoningEffort?: 'off' | 'low' | 'medium' | 'high';
  tools?: PuterTool[];
  simulate429?: boolean;
  vision?: boolean;
}

export interface PuterResult {
  text: string;
  toolCalls: PuterToolCall[];
  /** output tokens from the provider's own usage report, 0 when absent */
  tokensOut: number;
  exact: boolean;
}

/** An error that also carries the HTTP status, like `ApiError` elsewhere. */
export class PuterError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'PuterError';
    this.status = status;
  }
}

/** A reply longer than this is not "slow", it is stuck. */
const CALL_TIMEOUT_MS = 240_000;

/**
 * The endpoint this provider pretends to be. `PROVIDERS` stores a base URL, and
 * every other provider's URL is real; this one is a marker that sends the
 * request down this module instead of the OpenAI wire path.
 */
export const PUTER_BASE = `${API_ORIGIN}/drivers`;

export const isPuterEndpoint = (baseUrl: string): boolean =>
  /api\.puter\.com\/drivers/i.test(baseUrl);

/** Puter ids are `provider:model`; the model itself is the part that travels. */
const modelId = (id: string): string => {
  const i = id.indexOf(':');
  return i === -1 ? id : id.slice(i + 1);
};
const providerOf = (id: string): string => {
  const i = id.indexOf(':');
  return i === -1 ? '' : id.slice(0, i);
};

/**
 * The public chat catalogue. No token needed — this is the same list the SDK
 * fetches on startup, and it is what "Test connection" shows.
 *
 * Ids arrive as `openrouter:openai/gpt-6-luna`, one line per provider, so the
 * same model appears up to eight times. Stripping the provider prefix and
 * de-duplicating leaves the alias Puter itself accepts (`openai/gpt-6-luna`).
 * Azure/openrouter variants win the tie because they are the ones with a
 * published free allowance.
 */
export async function puterModels(): Promise<string[]> {
  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new PuterError(`Puter catalogue: HTTP ${res.status}`, res.status);
  const json: any = await res.json();
  const raw: string[] = (json?.models ?? []).map(String);
  if (!raw.length) throw new PuterError('Puter returned an empty model list');

  const rank = (id: string) => {
    const p = providerOf(id);
    if (p === 'openrouter') return 0;
    if (p === 'azure') return 1;
    if (p === 'openai' || p === 'anthropic') return 2;
    return 3;
  };

  const best = new Map<string, string>();
  for (const id of raw) {
    const name = modelId(id);
    const prev = best.get(name);
    if (!prev || rank(id) < rank(prev)) best.set(name, id);
  }
  return [...best.keys()].sort((a, b) => a.localeCompare(b));
}

/* ------------------------------- requests ------------------------------- */

const requestBody = (opts: PuterCallOptions, stream: boolean) => {
  const args: Record<string, unknown> = {
    messages: opts.wire,
    model: opts.model,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream,
    // Ask the driver for the OpenAI response shape (string content, OpenAI
    // tool_calls) instead of a provider-native content array.
    normalize: true,
  };
  if (opts.tools?.length) {
    args.tools = opts.tools;
    args.tool_choice = 'auto';
  }
  if (opts.reasoningEffort && opts.reasoningEffort !== 'off') {
    args.reasoning_effort = opts.reasoningEffort;
  }
  if (opts.vision) args.vision = true;

  return JSON.stringify({
    interface: 'puter-chat-completion',
    driver: 'ai-chat',
    method: 'complete',
    args,
    // The SDK sends the token in the body as well as the header; the header
    // alone works, but matching the SDK costs nothing.
    auth_token: opts.token,
  });
};

/** The message a 4xx/5xx body (or an `error` chunk) should surface. */
function explainError(raw: any, status: number, model: string): PuterError {
  const code = String(raw?.code ?? raw?.error?.code ?? '');
  const nested = raw?.error;
  const message =
    (typeof nested === 'string' ? nested : nested?.message) ??
    raw?.message ??
    'Puter request failed';

  if (status === 401 || code === 'token_missing' || code === 'token_auth_failed') {
    return new PuterError(
      'Puter token missing or expired — Settings → Puter (free) → Sign in.',
      401,
    );
  }
  if (code === 'subscription_required') {
    return new PuterError('This Puter route needs a paid plan. Use /drivers/call.', status);
  }
  if (code === 'upstream_credits_exhausted' || status === 503) {
    return new PuterError(`Puter has no credits left for ${model}.`, 503);
  }
  if (status === 429 || code === 'upstream_rate_limited' || code === 'too_many_requests') {
    return new PuterError(
      `Puter rate-limited ${model}. Wait a moment or pick another model.`,
      429,
    );
  }
  return new PuterError(message.slice(0, 300), status);
}

/** Join a normalized `message.content`, which may still be a block array. */
function contentToText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) =>
        typeof part === 'string' ? part : part?.type === 'text' ? part.text ?? '' : '',
      )
      .join('');
  }
  return '';
}

/** `usageDetails.outputTokens` is provider-neutral; the rest are fallbacks. */
function usageOut(usage: any, details: any): number {
  const n =
    details?.outputTokens ??
    usage?.output_tokens ??
    usage?.completion_tokens ??
    usage?.outputTokens;
  return typeof n === 'number' && n > 0 ? Math.round(n) : 0;
}

/* -------------------------------- one call ------------------------------- */

/**
 * One Puter completion, streamed or not.
 *
 * Written against XHR rather than fetch for the same reason as the OpenAI
 * client: React Native's fetch cannot expose a response stream, so we read
 * `responseText` growth through `onprogress` and split NDJSON lines ourselves.
 */
export function puterChat(
  opts: PuterCallOptions,
  onDelta: (t: string) => void,
  registerAbort: (fn: () => void) => void,
): Promise<PuterResult> {
  return new Promise((resolve, reject) => {
    if (!opts.token.trim()) {
      return reject(
        new PuterError('No Puter token yet — Settings → Puter (free) → Sign in.', 401),
      );
    }

    if (opts.simulate429) {
      return reject(
        new PuterError(
          `Quota used up (simulated): 20 requests/day on ${opts.model}.`,
          429,
        ),
      );
    }

    const xhr = new XMLHttpRequest();
    let seen = 0;
    let carry = '';
    let text = '';
    let tokensOut = 0;
    let exact = false;
    let settled = false;
    const calls: PuterToolCall[] = [];

    const done = (r: PuterResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    const fail = (e: Error) => {
      if (settled) return;
      settled = true;
      reject(e);
    };

    xhr.open('POST', CALL_URL, true);
    // The SDK sends this exact string: a JSON body in a content type that
    // never triggers a CORS preflight.
    xhr.setRequestHeader('Content-Type', 'text/plain;actually=json');
    xhr.setRequestHeader('Authorization', `Bearer ${opts.token.trim()}`);
    xhr.timeout = CALL_TIMEOUT_MS;
    registerAbort(() => xhr.abort());

    const mergeTool = (call: any) => {
      if (!call) return;
      const name = call.function?.name ?? call.name;
      if (!name) return;
      const rawArgs =
        call.function?.arguments ??
        (call.input !== undefined ? JSON.stringify(call.input) : '{}');
      calls.push({
        id: String(call.id ?? `call_${calls.length}`),
        type: 'function',
        function: { name: String(name), arguments: String(rawArgs) },
      });
    };

    const parseLine = (line: string) => {
      const t = line.trim();
      if (!t) return;

      let chunk: any;
      try {
        chunk = JSON.parse(t);
      } catch {
        return; // a partial line that survived the carry split; ignore
      }

      if (chunk.type === 'error' || chunk.error) {
        return fail(explainError(chunk, Number(chunk.status ?? 0), opts.model));
      }

      if (chunk.type === 'text' && typeof chunk.text === 'string' && chunk.text) {
        text += chunk.text;
        onDelta(chunk.text);
        return;
      }
      // Reasoning chunks are shown as normal text: the app has no separate
      // thinking pane, and swallowing them makes a slow model look dead.
      if (chunk.type === 'reasoning' && typeof chunk.reasoning === 'string' && chunk.reasoning) {
        text += chunk.reasoning;
        onDelta(chunk.reasoning);
        return;
      }
      if (chunk.type === 'tool_use') {
        mergeTool(chunk);
        return;
      }
      if (chunk.type === 'usage') {
        const n = usageOut(chunk.usage, chunk.usageDetails);
        if (n) {
          tokensOut = n;
          exact = true;
        }
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
      for (const line of parts) parseLine(line);
    };

    xhr.onprogress = drain;

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let body: any = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = { message: (xhr.responseText || '').slice(0, 200) };
        }
        return fail(explainError(body, xhr.status, opts.model));
      }

      if (opts.stream) {
        drain();
        if (carry.trim()) parseLine(carry);
        return done({ text, toolCalls: calls, tokensOut, exact });
      }

      // Non-streaming: { success, result: { message, usage } }
      let json: any;
      try {
        json = JSON.parse(xhr.responseText);
      } catch (e: any) {
        return fail(new PuterError('Could not parse Puter response: ' + e.message));
      }
      if (json?.success === false || json?.error) {
        return fail(explainError(json, 0, opts.model));
      }

      const result = json?.result ?? json;
      const message = result?.message ?? {};
      const answer = contentToText(message.content);
      if (answer) {
        text = answer;
        onDelta(answer);
      }
      const toolList = message.tool_calls ?? result?.tool_calls ?? [];
      if (Array.isArray(toolList)) toolList.forEach(mergeTool);

      const n = usageOut(result?.usage, result?.usageDetails ?? json?.usageDetails);
      done({ text, toolCalls: calls, tokensOut: n, exact: n > 0 });
    };

    xhr.onerror = () =>
      fail(new PuterError('Network error — Puter could not be reached.'));
    xhr.ontimeout = () =>
      fail(new PuterError('Puter took longer than 4 minutes to answer.', 408));
    xhr.onabort = () => fail(new PuterError('Stopped', -1));

    xhr.send(requestBody(opts, opts.stream));
  });
}
