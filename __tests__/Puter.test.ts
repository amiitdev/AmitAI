/**
 * The Puter route and the reply timing readout.
 *
 * Puter is not an OpenAI endpoint: it takes its own `{interface, driver,
 * method, args}` envelope and streams newline-delimited JSON. These tests pin
 * the wire shape (so a silent regression cannot ship), the token hand-off used
 * by the in-app sign-in, and the numbers the bubble prints.
 */

import {
  formatDuration,
  formatStats,
  formatTps,
  tokensPerSecond,
  approxTokens,
} from '../src/lib/measure';
import {
  isPuterEndpoint,
  puterChat,
  puterModels,
  PUTER_BASE,
} from '../src/api/puter';
import { tokenFromRedirect } from '../src/components/PuterSignIn';
import { runAgent, RunStats } from '../src/api/openai';

/* ------------------------------ formatting ------------------------------ */

describe('timing readout', () => {
  it('formats durations the way the bubble shows them', () => {
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(820)).toBe('820 ms');
    expect(formatDuration(4230)).toBe('4.2 s');
    expect(formatDuration(38_400)).toBe('38 s');
    expect(formatDuration(124_000)).toBe('2m 04s');
  });

  it('formats speed with a sensible number of digits', () => {
    expect(formatTps(0)).toBe('—');
    expect(formatTps(6.34)).toBe('6.3 tok/s');
    expect(formatTps(48.2)).toBe('48 tok/s');
    expect(formatTps(191.7)).toBe('192 tok/s');
  });

  it('computes tokens per second over a duration', () => {
    expect(tokensPerSecond(100, 2000)).toBe(50);
    expect(tokensPerSecond(0, 2000)).toBe(0);
    expect(tokensPerSecond(100, 0)).toBe(0);
  });

  it('builds one footer line, hiding a fast first token', () => {
    expect(
      formatStats({ latencyMs: 12_400, ttftMs: 300, tps: 48, tokens: 512, exact: true }),
    ).toBe('12 s · 48 tok/s · 512 tok');

    // Above a second the wait is worth explaining.
    expect(
      formatStats({ latencyMs: 12_400, ttftMs: 1400, tps: 48, tokens: 512, exact: true }),
    ).toBe('12 s · first 1.4 s · 48 tok/s · 512 tok');

    // An estimate never pretends to be exact.
    expect(formatStats({ latencyMs: 3000, tokens: 90 })).toBe('3.0 s · ~90 tok');
  });

  it('does not repeat the total as the first-token wait', () => {
    // The phone showed "13 s · first 13 s": when the reply arrives in one
    // burst at the end, the first token IS the answer, so the second number
    // said nothing.
    expect(formatStats({ latencyMs: 13_000, ttftMs: 12_996, tokens: 450, exact: true })).toBe(
      '13 s · 450 tok',
    );

    // Just inside the threshold (12 s of 13 s) still counts as the whole wait.
    expect(formatStats({ latencyMs: 13_000, ttftMs: 12_000, tokens: 450, exact: true })).toBe(
      '13 s · 450 tok',
    );
  });

  it('estimates tokens from characters', () => {
    expect(approxTokens('')).toBe(0);
    expect(approxTokens('abcd')).toBe(1);
    expect(approxTokens('a'.repeat(401))).toBe(101);
  });
});

/* ------------------------------- endpoint ------------------------------- */

describe('isPuterEndpoint', () => {
  it('recognises the Puter marker URL', () => {
    expect(isPuterEndpoint(PUTER_BASE)).toBe(true);
    expect(isPuterEndpoint('https://api.puter.com/drivers/')).toBe(true);
  });

  it('leaves every real OpenAI-compatible endpoint alone', () => {
    expect(isPuterEndpoint('https://api.openai.com/v1')).toBe(false);
    expect(isPuterEndpoint('https://openrouter.ai/api/v1')).toBe(false);
    expect(isPuterEndpoint('http://127.0.0.1:8130/v1')).toBe(false);
    expect(isPuterEndpoint('http://127.0.0.1:8080/v1')).toBe(false);
  });
});

/* ------------------------------ model list ------------------------------ */

describe('puterModels', () => {
  const realFetch = (globalThis as any).fetch;

  afterEach(() => {
    (globalThis as any).fetch = realFetch;
  });

  it('collapses one model listed by eight providers into one id', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        models: [
          'infron:openai/gpt-6-luna',
          'openrouter:openai/gpt-6-luna',
          'azure:openai/gpt-6-luna',
          'openai:openai/gpt-6-luna',
          'openrouter:anthropic/claude-sonnet-5',
        ],
      }),
    })) as any;

    const models = await puterModels();
    expect(models).toEqual(['anthropic/claude-sonnet-5', 'openai/gpt-6-luna']);
  });

  it('reports a bad catalogue instead of pretending it is empty', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({ ok: false, status: 502 })) as any;
    await expect(puterModels()).rejects.toThrow(/HTTP 502/);
  });
});

/* -------------------------------- one call ------------------------------ */

/** Minimal XHR: the tests drive the response by hand. */
class FakeXHR {
  static last: FakeXHR;
  status = 200;
  responseText = '';
  timeout = 0;
  url = '';
  body = '';
  headers: Record<string, string> = {};
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: string) {
    this.body = body;
    FakeXHR.last = this;
  }
  abort() {
    this.onabort?.();
  }

  /** Push a raw chunk of the response, as the network would. */
  push(chunk: string) {
    this.responseText += chunk;
    this.onprogress?.();
  }
  finish(status = 200) {
    this.status = status;
    this.onload?.();
  }
}

describe('puterChat', () => {
  const realXHR = (globalThis as any).XMLHttpRequest;
  beforeEach(() => {
    (globalThis as any).XMLHttpRequest = FakeXHR;
  });
  afterEach(() => {
    (globalThis as any).XMLHttpRequest = realXHR;
  });

  const base = {
    token: 'tok-123',
    model: 'gpt-6-luna',
    wire: [{ role: 'user', content: 'hi' }],
    temperature: 0.7,
    maxTokens: 256,
    stream: true,
  };

  it('sends the driver envelope the SDK uses', async () => {
    const p = puterChat(base, () => {}, () => {});
    const xhr = FakeXHR.last;
    expect(xhr.url).toBe('https://api.puter.com/drivers/call');
    expect(xhr.headers.Authorization).toBe('Bearer tok-123');

    const body = JSON.parse(xhr.body);
    expect(body.interface).toBe('puter-chat-completion');
    expect(body.driver).toBe('ai-chat');
    expect(body.method).toBe('complete');
    expect(body.auth_token).toBe('tok-123');
    expect(body.args.model).toBe('gpt-6-luna');
    expect(body.args.stream).toBe(true);
    expect(body.args.normalize).toBe(true);

    xhr.push('{"type":"usage","usageDetails":{"outputTokens":3}}\n');
    xhr.finish();
    await p;
  });

  it('reads text, tool calls and exact usage out of the NDJSON stream', async () => {
    const deltas: string[] = [];
    const p = puterChat(base, t => deltas.push(t), () => {});
    const xhr = FakeXHR.last;

    // Split across chunk boundaries on purpose: the second line arrives in two
    // pieces, which is what a real stream does.
    xhr.push('{"type":"text","text":"Hel');
    xhr.push('lo"}\n{"type":"text","text":" there"}\n');
    xhr.push('{"type":"tool_use","id":"c1","name":"get_time","input":{"city":"Pune"}}\n');
    xhr.push('{"type":"usage","usageDetails":{"outputTokens":42}}\n');
    xhr.finish();

    const out = await p;
    expect(deltas.join('')).toBe('Hello there');
    expect(out.text).toBe('Hello there');
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls[0].function.name).toBe('get_time');
    expect(JSON.parse(out.toolCalls[0].function.arguments)).toEqual({ city: 'Pune' });
    expect(out).toMatchObject({ tokensOut: 42, exact: true });
  });

  it('surfaces an error chunk instead of returning half an answer', async () => {
    const p = puterChat(base, () => {}, () => {});
    FakeXHR.last.push(
      '{"type":"error","message":"upstream broke","code":"upstream_rate_limited","status":429}\n',
    );
    await expect(p).rejects.toThrow(/rate-limited/);
  });

  it('refuses to run without a token', async () => {
    await expect(puterChat({ ...base, token: '  ' }, () => {}, () => {})).rejects.toThrow(
      /No Puter token/,
    );
  });

  it('unwraps the non-streaming { success, result } envelope', async () => {
    const p = puterChat({ ...base, stream: false }, () => {}, () => {});
    const xhr = FakeXHR.last;
    xhr.responseText = JSON.stringify({
      success: true,
      result: { message: { role: 'assistant', content: 'done' }, usage: { output_tokens: 7 } },
    });
    xhr.finish();

    const out = await p;
    expect(out.text).toBe('done');
    expect(out.tokensOut).toBe(7);
  });

  it('explains an expired token rather than echoing a 401', async () => {
    const p = puterChat(base, () => {}, () => {});
    const xhr = FakeXHR.last;
    xhr.responseText = '{"error":{"message":"Missing authentication token"},"code":"token_missing"}';
    xhr.finish(401);
    await expect(p).rejects.toThrow(/Settings → Puter/);
  });
});

/* ------------------------------- agent loop ----------------------------- */

describe('runAgent over Puter', () => {
  const realXHR = (globalThis as any).XMLHttpRequest;
  beforeEach(() => {
    (globalThis as any).XMLHttpRequest = FakeXHR;
  });
  afterEach(() => {
    (globalThis as any).XMLHttpRequest = realXHR;
  });

  it('routes to Puter and reports time and speed with the answer', async () => {
    const stats: RunStats[] = [];
    const texts: string[] = [];

    const done = new Promise<void>(resolve => {
      runAgent(
        {
          baseUrl: PUTER_BASE,
          apiKey: 'tok',
          model: 'gpt-6-luna',
          messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: Date.now() }],
          systemPrompt: '',
          temperature: 0.7,
          maxTokens: 128,
          stream: true,
        },
        {
          onDelta: () => {},
          onStats: s => stats.push(s),
          onDone: t => {
            texts.push(t);
            resolve();
          },
          onError: e => {
            throw e;
          },
        },
      );
    });

    const xhr = FakeXHR.last;
    expect(xhr.url).toContain('api.puter.com/drivers/call');
    xhr.push('{"type":"text","text":"hello world"}\n');
    // The first token starts the generation window. A single-burst answer has
    // no measurable window (see the test below), so the fake provider waits a
    // real moment before finishing, the way a streaming model would.
    await new Promise<void>(resolve => setTimeout(() => resolve(), 320));
    xhr.push('{"type":"usage","usageDetails":{"outputTokens":40}}\n');
    xhr.finish();
    await done;

    expect(texts[0]).toBe('hello world');
    expect(stats).toHaveLength(1);
    expect(stats[0].exact).toBe(true);
    expect(stats[0].tokensOut).toBe(40);
    expect(stats[0].totalMs).toBeGreaterThanOrEqual(0);
    expect(stats[0].tps).toBeGreaterThan(0);
  });

  it('claims no speed when the whole answer lands in one burst', async () => {
    // Straight off the phone: "13 s · first 13 s · 450000 tok/s · 450 tok".
    // Puter buffered the reply and delivered it at the very end, so the first
    // and last token were ~1 ms apart and 450 tokens divided by that printed
    // 450000 tok/s. Both halves of that footer were wrong: the speed was
    // invented, and "first 13 s" only repeated "13 s".
    const stats: RunStats[] = [];
    const done = new Promise<void>(resolve => {
      runAgent(
        {
          baseUrl: PUTER_BASE,
          apiKey: 'tok',
          model: 'gpt-6-luna',
          messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: Date.now() }],
          systemPrompt: '',
          temperature: 0.7,
          maxTokens: 128,
          stream: true,
        },
        {
          onDelta: () => {},
          onStats: s => stats.push(s),
          onDone: () => resolve(),
          onError: e => {
            throw e;
          },
        },
      );
    });

    const xhr = FakeXHR.last;
    xhr.push('{"type":"text","text":"a buffered answer"}\n');
    xhr.push('{"type":"usage","usageDetails":{"outputTokens":450}}\n');
    xhr.finish();
    await done;

    const [s] = stats;
    expect(s.tokensOut).toBe(450);
    expect(s.tps).toBe(0);

    const footer = formatStats({
      latencyMs: s.totalMs,
      ttftMs: s.ttftMs,
      tps: s.tps,
      tokens: s.tokensOut,
      exact: s.exact,
    });
    expect(footer).not.toContain('tok/s');
  });
});

/* -------------------------------- sign-in ------------------------------- */

describe('tokenFromRedirect', () => {
  it('picks the token out of the loopback callback', () => {
    expect(tokenFromRedirect('http://127.0.0.1:8931/?state=abc&token=tok-1')).toBe('tok-1');
    expect(tokenFromRedirect('http://localhost:8931/?token=a%2Bb')).toBe('a+b');
  });

  it('ignores every other navigation, so browsing still works', () => {
    expect(tokenFromRedirect('https://puter.com/?action=authme')).toBeNull();
    expect(tokenFromRedirect('http://127.0.0.1:8931/?state=abc')).toBeNull();
    expect(tokenFromRedirect('https://evil.test/?token=stolen')).toBeNull();
  });
});
