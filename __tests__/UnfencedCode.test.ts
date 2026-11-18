import { looksLikeCode, parseMarkdown } from '../src/components/Markdown';

describe('unfenced code', () => {
  test('a run of statements is code', () => {
    expect(looksLikeCode(['def add(a, b):', '    return a + b', 'print(add(2, 3))'])).toBe(true);
  });

  test('prose is not code', () => {
    expect(looksLikeCode(['Lists hold many values.', 'Dicts map keys to values.'])).toBe(false);
  });

  test('a single assignment is code, a single sentence is not', () => {
    expect(looksLikeCode(['x = 1'])).toBe(true);
    expect(looksLikeCode(['Answer is forty two'])).toBe(false);
    expect(looksLikeCode(['Use a dict (it is fast)'])).toBe(false);
  });

  test('python without a fence keeps its newlines and indentation', () => {
    const blocks = parseMarkdown('def add(a, b):\n    return a + b\nprint(add(2, 3))');
    expect(blocks[0].kind).toBe('code');
    const code = blocks[0] as any;
    expect(code.text).toContain('\n    return a + b');
  });

  test('a fenced block still wins', () => {
    const blocks = parseMarkdown('```python\nprint(1)\n```');
    expect(blocks[0]).toMatchObject({ kind: 'code', lang: 'python' });
  });

  test('prose still collapses its soft breaks', () => {
    const blocks = parseMarkdown('one line\nsecond line');
    expect(blocks[0]).toMatchObject({ kind: 'para', text: 'one line second line' });
  });
});
