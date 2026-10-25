import { Settings, Source } from '../types';
import { ExecuteResult, ToolDef } from '../api/openai';
import { readPage, webSearch, getWeather, calculate, getTime } from '../api/tools';
import { requestRenderedRead } from './reader';

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
    return true;
  });


  const label = (name: string, args: any) => {
    if (name === 'web_search') return `Searching “${String(args?.query ?? '').slice(0, 40)}”`;
    if (name === 'open_page') return `Reading ${hostOf(String(args?.url ?? ''))}`;
    if (name === 'get_weather') return `Weather for “${String(args?.query ?? '').slice(0, 30)}”`;
    if (name === 'calculate') return `Calculating`;
    if (name === 'get_time') return `Checking time`;
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

    throw new Error(`unknown tool ${name}`);
  }

  return { execute, tools, label };
}
