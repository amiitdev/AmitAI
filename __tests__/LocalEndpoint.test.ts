import { isLocalEndpoint } from '../src/api/openai';

/**
 * The on-device GGUF prints tool calls as plain text instead of returning a
 * `tool_calls` array, so every caller must drop its tool list for these
 * endpoints. These tests pin the URL shapes that count as "local".
 */
describe('isLocalEndpoint', () => {
  it('matches the loopback llama-server, with and without /v1', () => {
    expect(isLocalEndpoint('http://127.0.0.1:8080/v1')).toBe(true);
    expect(isLocalEndpoint('http://127.0.0.1:8080')).toBe(true);
    expect(isLocalEndpoint('http://localhost:8080/v1')).toBe(true);
    expect(isLocalEndpoint('http://127.0.0.1:8080/v1/')).toBe(true);
  });

  it('does not match the cloud providers', () => {
    expect(isLocalEndpoint('https://api.openai.com/v1')).toBe(false);
    expect(isLocalEndpoint('https://openrouter.ai/api/v1')).toBe(false);
    expect(isLocalEndpoint('https://generativelanguage.googleapis.com/v1beta/openai')).toBe(false);
  });

  it('does not match the other phone-local services', () => {
    // 8130 is the AmitAI Bridge (a real OpenAI endpoint — it keeps its tools)
    expect(isLocalEndpoint('http://127.0.0.1:8130/v1')).toBe(false);
    // 8131 is the FreeBuff Bridge (same contract, different engine)
    expect(isLocalEndpoint('http://127.0.0.1:8131/v1')).toBe(false);
    // Ollama on the laptop
    expect(isLocalEndpoint('http://192.168.29.133:11434/v1')).toBe(false);
  });
});
