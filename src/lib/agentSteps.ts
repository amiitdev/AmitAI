/**
 * Turns the bridge's streamed tool trace into structured steps.
 *
 * The bridge writes one line per tool call:
 *   - **write** `portfolio/index.html` ✓
 *   - **bash** `ls -la`
 * The second form (no tick) is still in flight. Parsing it here keeps the
 * renderer dumb and lets the rule be tested without mounting the app.
 */

export interface AgentStep {
  tool: string;
  detail?: string;
  state: 'running' | 'done' | 'failed';
}

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'steps'; steps: AgentStep[] };

/** `- **tool** rest…` — the only shape the bridge emits. */
const STEP_LINE = /^-\s+\*\*([a-z_0-9]+)\*\*\s*(.*)$/i;

/** Lines longer than this are prose that happens to start with a bullet. */
const MAX_STEP_LINE = 160;

export function parseStepLine(line: string): AgentStep | null {
  const t = line.trim();
  if (!t || t.length > MAX_STEP_LINE) return null;
  const m = STEP_LINE.exec(t);
  if (!m) return null;

  const tool = m[1];
  let rest = m[2].trim();
  let state: AgentStep['state'] = 'running';
  const failAt = rest.indexOf('✗');
  if (failAt >= 0) {
    state = 'failed';
    rest = rest.slice(0, failAt).trim();
  } else if (rest.endsWith('✓')) {
    state = 'done';
    rest = rest.slice(0, -1).trim();
  }
  // A half-streamed line can end mid-backtick; strip what is there.
  rest = rest.replace(/^`+/, '').replace(/`+$/, '').trim();

  return { tool, detail: rest || undefined, state };
}

/**
 * Splits message content into alternating prose and step blocks, in order.
 * Prose stays markdown; steps are rendered as their own compact list.
 */
export function splitAgentSteps(content: string): Segment[] {
  const out: Segment[] = [];
  let text: string[] = [];
  let steps: AgentStep[] = [];

  const flushText = () => {
    const joined = text.join('\n').trim();
    if (joined) out.push({ kind: 'text', text: joined });
    text = [];
  };
  const flushSteps = () => {
    if (steps.length) out.push({ kind: 'steps', steps });
    steps = [];
  };

  for (const line of content.split('\n')) {
    const t = line.trim();
    // A completion tick can arrive in its own chunk after the next text began;
    // fold it back onto the step it belongs to instead of starting a paragraph.
    if (/^[✓✗]/.test(t) && steps.length) {
      steps[steps.length - 1].state = t.startsWith('✗') ? 'failed' : 'done';
      continue;
    }
    const step = parseStepLine(line);
    if (step) {
      flushText();
      steps.push(step);
    } else if (!t && steps.length) {
      // blank lines inside a run of steps belong to the run
      continue;
    } else {
      flushSteps();
      text.push(line);
    }
  }
  flushText();
  flushSteps();

  return out.length ? out : [{ kind: 'text', text: content }];
}
