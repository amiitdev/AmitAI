import { Settings, Source } from '../types';
import { ExecuteResult, ToolDef } from '../api/openai';
import { readPage, webSearch, getWeather, calculate, getTime } from '../api/tools';
import { requestRenderedRead } from './reader';
import { readClipboard, hasScheduler } from './native';
import { addNote, searchNotes, deleteNote, formatNotes } from './memory';
import {
  addSchedule,
  describe,
  formatWhen,
  humanIn,
  loadSchedules,
  nextRun,
  parseWhen,
  removeSchedule,
} from './schedules';
import { titleFrom } from '../storage/store';

/**
 * The tools the model is allowed to call, and what actually happens when it
 * does. Everything runs on the phone: DuckDuckGo for search, Open-Meteo for
 * weather (no key), a plain fetch for most pages, a hidden WebView for pages
 * that need JS, and pure-JS calculator and clock.
 */
export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Search the web for current information. Use this for anything recent, priced, versioned or factual that you are not certain about.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query, in the language of the answer.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_page',
      description:
        'Open one URL and return its readable text. Use after web_search when a snippet is not enough, or when the user pastes a link.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Absolute http(s) URL to read.' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description:
        'Get the current weather for a city or place. Use for any question about today\'s weather, temperature, rain, wind or whether to carry an umbrella.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'A city name or place, e.g. “London”, “Tokyo”, “New York”.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description:
        'Do arithmetic or a small math calculation. Use for anything with numbers: percentages, tips, unit conversions you can express as arithmetic, exponents, square roots. Do NOT use it for factual lookups — only for math.',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: 'A math expression in plain notation, e.g. “15% of 340” is written as “340 * 0.15”, “square root of 144” as “sqrt(144)”, “2 to the power 10” as “2^10”.' },
        },
        required: ['expression'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description:
        'Return the current time or date in a city, timezone or the device\'s local time. Use for “what time is it in Tokyo”, “is it morning in London yet”, “what is the date today”. Do not use for anything other than time/date.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'A city name, timezone or empty for the device\'s local time, e.g. “Tokyo”, “London”, “UTC”, or “” for local.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_clipboard',
      description:
        'Read the text the user last copied on this phone. Use when the user says “this”, “what I copied”, “the text on my clipboard”, or pastes nothing but asks about something they clearly copied. Never invent clipboard content — call this.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description:
        'Save a durable note to the user\'s on-device memory: preferences, names, IDs, plans, anything they say “remember that…” about. Memory survives restarts and is visible in Settings › Memory. Do not save secrets like passwords unless the user explicitly asks.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The fact to store, written as a standalone sentence, e.g. “Amit\'s home Wi-Fi SSID is JioFiber-5G”.',
          },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description:
        'Search the user\'s saved memory (notes from earlier chats). Use for “what do you know about me”, “what is my …”, or before asking the user to repeat something. Call with an empty query to list the most recent notes.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to search for, e.g. “wifi”, “birthday”, “project”. Empty lists recent notes.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forget',
      description:
        'Delete a saved memory. Only call when the user asks to forget something. If more than one note matches, do not delete: list the matches and ask which one.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words identifying the note to delete.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_schedule',
      description:
        'Create a recurring or one-off job that runs on its own and delivers the answer as a notification, even when the app is closed. Use this whenever the user asks for something to happen automatically or on a schedule: “tell me the weather every day at 8 am”, “remind me every Monday at 9pm to plan the week”, “check the news tomorrow at 7”. The prompt is what the model is asked each time — write it as a complete, self-contained request.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short notification title, e.g. “Morning weather”.' },
          prompt: {
            type: 'string',
            description: 'The full question to run each time, e.g. “Give me today\'s weather in Nagpur in 3 lines: temperature, rain chance, and what to wear.”',
          },
          when: {
            type: 'string',
            description:
              'When to run, in natural language or cron. Examples: “every day at 8 am”, “daily 07:30”, “every monday at 9pm”, “every 2 hours”, “tomorrow at 7pm”, “weekdays at 8:30”, “30 7 * * 1-5”. Convert relative words to these forms; the phone\'s clock resolves them.',
          },
        },
        required: ['title', 'prompt', 'when'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_schedules',
      description:
        'List the user\'s scheduled jobs with their next run time, and the result of the last run. Use for “what is scheduled”, “what reminders do I have”.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_schedule',
      description:
        'Cancel a scheduled job. Use when the user asks to stop or remove a recurring task. Match by title or by words from its prompt.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The job title, or words that identify it, e.g. “morning weather”.' },
        },
        required: ['title'],
      },
    },
  },
];

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
};

export interface Executor {
  execute: (name: string, args: any) => Promise<ExecuteResult>;
  tools: ToolDef[];
  label: (name: string, args: any) => string;
}

/**
 * One executor per user turn: this is where the "max pages per answer" budget
 * lives, so the model cannot quietly read twenty pages and burn your tokens.
 */
export function makeExecutor(settings: Settings): Executor {
  let pagesLeft = Math.max(1, settings.maxPages);
  // The model can only call what we advertise. Web tools are gated by the
  // two web toggles; weather / calculator / time are always available because
  // they are local and free.
  const tools = TOOL_DEFS.filter(t => {
    const name = t.function.name;
    if (name === 'web_search') return settings.webSearch;
    if (name === 'open_page') return settings.webRead;
    if (name === 'get_weather') return settings.toolsWeather;
    if (name === 'calculate') return settings.toolsCalculator;
    if (name === 'get_time') return settings.toolsTime;
    if (name === 'read_clipboard') return settings.toolsClipboard;
    if (name === 'remember' || name === 'recall' || name === 'forget') return settings.toolsMemory;
    if (name === 'create_schedule' || name === 'list_schedules' || name === 'delete_schedule')
      return settings.toolsSchedules;
    return true;
  });


  const label = (name: string, args: any) => {
    if (name === 'web_search') return `Searching “${String(args?.query ?? '').slice(0, 40)}”`;
    if (name === 'open_page') return `Reading ${hostOf(String(args?.url ?? ''))}`;
    if (name === 'get_weather') return `Weather for “${String(args?.query ?? '').slice(0, 30)}”`;
    if (name === 'calculate') return `Calculating`;
    if (name === 'get_time') return `Checking time`;
    if (name === 'read_clipboard') return 'Reading clipboard';
    if (name === 'remember') return 'Saving to memory';
    if (name === 'recall') return 'Searching memory';
    if (name === 'forget') return 'Updating memory';
    if (name === 'create_schedule') return 'Scheduling';
    if (name === 'list_schedules') return 'Reading schedules';
    if (name === 'delete_schedule') return 'Cancelling schedule';
    return name;
  };

  const execute = async (name: string, args: any): Promise<ExecuteResult> => {
    if (name === 'web_search') {
      const query = String(args?.query ?? '').trim();
      if (!query) throw new Error('empty query');

      const results = await webSearch(query, 6);
      if (!results.length) throw new Error('no results');

      const sources: Source[] = results.slice(0, 4).map(r => ({ title: r.title, url: r.url }));
      const content = results
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
        .join('\n');
      return { content: `Search results for "${query}":\n${content}`, sources };
    }

    if (name === 'open_page') {
      const url = String(args?.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) throw new Error('not a URL');
      if (pagesLeft <= 0) throw new Error('page budget for this answer is used up');
      pagesLeft--;

      // browser mode: render JS first, fall back to the fast path
      if (settings.readerMode === 'browser') {
        try {
          const text = await requestRenderedRead(url);
          return { content: `Text of ${url}:\n${text}` };
        } catch {
          /* fall through to fetch */
        }
      }

      let text: string;
      try {
        text = await readPage(url, 4000);
      } catch {
        // fast path failed (JS-only page): try the hidden browser once
        text = await requestRenderedRead(url);
      }
      return { content: `Text of ${url}:\n${text}` };
    }

    if (name === 'get_weather') {
      const query = String(args?.query ?? '').trim();
      if (!query) throw new Error('weather needs a place name');
      const w = await getWeather(query);
      return {
        content: `Weather in ${w.city}: ${w.tempC}°C (feels like ${w.feelsLike}°C), ${w.condition}, wind ${w.windKmh} km/h, humidity ${w.humidity}%.`,
      };
    }

    if (name === 'calculate') {
      const expr = String(args?.expression ?? '').trim();
      if (!expr) throw new Error('calculation needs an expression');
      let result: number;
      try {
        result = calculate(expr);
      } catch (e: any) {
        throw new Error(`Calculation error: ${e?.message ?? 'invalid expression'}`);
      }
      const rounded = Number.isInteger(result) ? result : parseFloat(result.toFixed(6));
      return { content: `${expr} = ${rounded}` };
    }

    if (name === 'get_time') {
      const query = String(args?.query ?? '').trim();
      return { content: getTime(query) };
    }

    if (name === 'read_clipboard') {
      const text = (await readClipboard()).trim();
      if (!text) return { content: 'The clipboard is empty.' };
      return { content: `Text on the clipboard:\n${text.slice(0, 8000)}` };
    }

    if (name === 'remember') {
      const text = String(args?.text ?? '').trim();
      if (!text) throw new Error('nothing to remember');
      const note = await addNote(text);
      return { content: `Saved to memory: ${note.text}` };
    }

    if (name === 'recall') {
      const query = String(args?.query ?? '').trim();
      const notes = await searchNotes(query, 10);
      if (!notes.length) {
        return {
          content: query
            ? `No saved memory matched “${query}”.`
            : 'The memory is empty — nothing has been saved yet.',
        };
      }
      return {
        content: `${query ? `Memory matching “${query}”` : 'Recent memory'}:\n${formatNotes(notes)}`,
      };
    }

    if (name === 'forget') {
      const query = String(args?.query ?? '').trim();
      if (!query) throw new Error('say what should be forgotten');
      const hits = await searchNotes(query, 20);
      if (!hits.length) return { content: `Nothing in memory matched “${query}”.` };
      if (hits.length > 1) {
        return {
          content:
            `More than one note matches, so nothing was deleted. Ask the user which one:\n` +
            formatNotes(hits),
        };
      }
      await deleteNote(hits[0].id);
      return { content: `Forgotten: ${hits[0].text}` };
    }

    if (name === 'create_schedule') {
      const title = String(args?.title ?? '').trim();
      const prompt = String(args?.prompt ?? '').trim();
      const when = String(args?.when ?? '').trim();
      if (!prompt) throw new Error('a schedule needs a prompt to run');
      if (!when) throw new Error('a schedule needs a time, e.g. “every day at 8 am”');

      const parsed = parseWhen(when);
      if (!parsed.ok) throw new Error(parsed.error ?? 'could not read that time');

      const schedule = await addSchedule({
        title: title || titleFrom(prompt),
        prompt,
        when,
        parsed,
      });
      const next = nextRun(schedule);
      const whenText = describe(schedule);
      const nextText =
        next !== null
          ? `${formatWhen(next)} (${humanIn(next - Date.now())})`
          : 'never — check the trigger';
      const bridge = hasScheduler
        ? 'It runs even when AmitAI is closed; the answer arrives as a notification.'
        : 'Note: alarm scheduling is not available in this build, so it will only run when AmitAI opens.';
      return {
        content:
          `Scheduled “${schedule.title}” — ${whenText}. Next run: ${nextText}. ` + bridge,
      };
    }

    if (name === 'list_schedules') {
      const list = await loadSchedules();
      if (!list.length) return { content: 'No scheduled jobs. Nothing is queued to run.' };
      const lines = list.map((s, i) => {
        const next = nextRun(s);
        const state = s.enabled ? (next ? `next ${formatWhen(next)}` : 'no next run') : 'paused';
        const last = s.lastRun
          ? ` · last ${formatWhen(s.lastRun)}${s.lastError ? ` (failed: ${s.lastError.slice(0, 80)})` : ''}`
          : '';
        return `${i + 1}. ${s.title} — ${describe(s)} · ${state}${last}`;
      });
      return { content: `Scheduled jobs:\n${lines.join('\n')}` };
    }

    if (name === 'delete_schedule') {
      const query = String(args?.title ?? '').trim().toLowerCase();
      if (!query) throw new Error('say which schedule to cancel');
      const list = await loadSchedules();
      const hits = list.filter(
        s =>
          s.id.toLowerCase() === query ||
          s.title.toLowerCase().includes(query) ||
          s.prompt.toLowerCase().includes(query),
      );
      if (!hits.length) return { content: `No schedule matched “${query}”.` };
      if (hits.length > 1) {
        return {
          content:
            'Several schedules match, so nothing was cancelled. Ask the user which one:\n' +
            hits.map((s, i) => `${i + 1}. ${s.title} — ${describe(s)}`).join('\n'),
        };
      }
      await removeSchedule(hits[0].id);
      return { content: `Cancelled “${hits[0].title}” (${describe(hits[0])}).` };
    }

    throw new Error(`unknown tool ${name}`);
  }

  return { execute, tools, label };
}
