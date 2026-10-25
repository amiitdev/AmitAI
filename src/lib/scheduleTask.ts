import { loadSettings } from '../storage/store';
import { describe, loadSchedules, markScheduleRun } from './schedules';
import { makeExecutor } from './agentTools';
import { runAgent } from '../api/openai';
import { notify } from './native';

/**
 * The headless half of a scheduled job.
 *
 * Triggered by ScheduleTaskService (Kotlin) → registered in index.js as
 * `AmitScheduleTask`. It runs the exact same agent loop as a typed message —
 * tools included, so "weather every morning" really does call get_weather — and
 * posts the answer as a notification.
 *
 * Failure policy: always record the outcome and always re-arm the next run.
 * A schedule that dies because one API call failed is worse than a notification
 * saying it failed.
 */
export default async function scheduleTask(data: {
  id: string;
  title?: string;
  prompt?: string;
}): Promise<void> {
  const id = data?.id;
  if (!id) return;

  const list = await loadSchedules();
  const schedule = list.find(s => s.id === id);
  const title = schedule?.title || data.title || 'AmitAI task';
  const prompt = schedule?.prompt || data.prompt || '';
  if (!prompt) return;

  const settings = await loadSettings();
  const needsKey = !settings.apiKey && !settings.baseUrl.includes('11434');
  if (needsKey) {
    await markScheduleRun(id, { error: 'No API key — open AmitAI → Settings.' });
    await notify(`⏰ ${title}`, 'AmitAI has no API key, so this job could not run.', id);
    return;
  }

  const exec = makeExecutor(settings);
  const userText = [
    `[Scheduled task — ${schedule ? describe(schedule) : 'one-off'}]`,
    `Local time on the phone: ${new Date().toString()}.`,
    prompt,
  ].join('\n');

  let answer = '';
  let failure = '';

  await new Promise<void>(resolve => {
    runAgent(
      {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        messages: [
          {
            id: `schedule-${id}`,
            role: 'user',
            content: userText,
            createdAt: Date.now(),
          },
        ],
        systemPrompt: settings.systemPrompt,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        stream: false,
        reasoningEffort: settings.reasoningEffort,
        tools: exec.tools,
        maxRounds: 3,
        execute: exec.execute,
      },
      {
        onDelta: t => {
          answer += t;
        },
        onDone: text => {
          answer = text || answer;
          resolve();
        },
        onError: err => {
          failure = err?.message || 'The request failed.';
          resolve();
        },
      },
    );
  });

  const body = failure
    ? `The job failed: ${failure}`
    : answer.trim() || 'The job finished without a reply.';

  try {
    await markScheduleRun(id, { text: failure ? undefined : answer, error: failure || undefined });
  } catch {
    /* storage trouble must not swallow the notification below */
  }
  await notify(`⏰ ${title}`, body, id);
}
