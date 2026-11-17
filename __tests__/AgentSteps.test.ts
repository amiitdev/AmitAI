import { parseStepLine, splitAgentSteps } from '../src/lib/agentSteps';

describe('agent step parsing', () => {
  test('reads a finished step', () => {
    expect(parseStepLine('- **write** `portfolio/index.html` ✓')).toEqual({
      tool: 'write',
      detail: 'portfolio/index.html',
      state: 'done',
    });
  });

  test('a step without a tick is still running', () => {
    expect(parseStepLine('- **bash** `ls -la`')).toEqual({
      tool: 'bash',
      detail: 'ls -la',
      state: 'running',
    });
  });

  test('a half-streamed line is not dropped', () => {
    expect(parseStepLine('- **write** `inde')).toEqual({
      tool: 'write',
      detail: 'inde',
      state: 'running',
    });
  });

  test('failed steps keep their reason', () => {
    expect(parseStepLine('- **bash** `rm x` ✗ nope')).toEqual({
      tool: 'bash',
      detail: 'rm x',
      state: 'failed',
    });
  });

  test('ordinary prose bullets are not steps', () => {
    expect(parseStepLine('- `index.html` — three cards')).toBeNull();
    expect(parseStepLine('- **Important**: read this')).not.toBeNull();
  });

  test('splits prose from steps in order', () => {
    const segments = splitAgentSteps(
      'Working on it.\n- **bash** `mkdir demo` ✓\n- **write** `demo/index.html` ✓\nAll three files exist.',
    );
    expect(segments.map(s => s.kind)).toEqual(['text', 'steps', 'text']);
    expect(segments[0]).toEqual({ kind: 'text', text: 'Working on it.' });
    const steps = segments[1] as any;
    expect(steps.steps).toHaveLength(2);
    expect(steps.steps[1].detail).toBe('demo/index.html');
    expect(segments[2]).toEqual({ kind: 'text', text: 'All three files exist.' });
  });

  test('plain text stays one segment', () => {
    expect(splitAgentSteps('just an answer')).toEqual([{ kind: 'text', text: 'just an answer' }]);
  });

  test('a tick that arrives on its own line completes the last step', () => {
    const segments = splitAgentSteps('- **bash** `ls`\n\n✓\nDone.');
    const steps = segments[0] as any;
    expect(steps.steps[0].state).toBe('done');
    expect(segments.some(s => s.kind === 'text' && s.text.includes('✓'))).toBe(false);
  });
});
