/**
 * On-device tools: web search + page reading + weather + calculator + clock.
 *
 * Everything here runs inside the APK. DuckDuckGo's HTML endpoint is a plain
 * document (no JS), so a normal HTTP GET is enough; React Native is not a
 * browser, so there is no CORS to fight either.
 *
 * Weather uses Open-Meteo (no key, free for non-commercial use). Calculator and
 * clock are pure JS — they exist so the model can answer "what is 15% of 340"
 * and "what time is it in Tokyo" without burning tokens on reasoning.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
export interface Source {
  title: string;
  url: string;
}

/** Weather result for one location. */
export interface WeatherResult {
  city: string;
  tempC: number;
  feelsLike: number;
  condition: string;
  windKmh: number;
  humidity: number;
  query: string;
}

/* ------------------------------- transport ------------------------------- */

const UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

/** XHR GET → text. Lets us set a real User-Agent, which fetch may drop. */
export function httpGet(url: string, timeoutMs = 12000): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = timeoutMs;
    xhr.setRequestHeader('User-Agent', UA);
    xhr.setRequestHeader('Accept', 'text/html,application/xhtml+xml');
    xhr.setRequestHeader('Accept-Language', 'en-IN,en;q=0.9');
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText || '');
      else reject(new Error(`HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Timed out'));
    xhr.send();
  });
}

/* -------------------------------- helpers -------------------------------- */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&([a-z]+|#\d+);/gi, (m, k) => ENTITIES[k.toLowerCase()] ?? m);
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/* --------------------------------- search -------------------------------- */

function cleanDdgUrl(href: string): string | null {
  let url = decodeEntities(href);
  const uddg = url.match(/[?&]uddg=([^&]+)/);
  if (uddg) {
    try {
      url = decodeURIComponent(uddg[1]);
    } catch {
      return null;
    }
  }
  if (url.startsWith('//')) url = 'https:' + url;
  if (!/^https?:\/\//i.test(url)) return null;
  if (/duckduckgo\.com\/(y\.js|l\.php)/i.test(url)) return null; // ads
  return url;
}

/** Parse the classic DDG HTML layout. Tolerant of attribute reordering. */
export function parseDdgHtml(html: string, limit: number): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();

  const anchor = /<a\b([^>]*class="[^"]*result__a[^"]*"[^>]*)>([\s\S]*?)<\/a>/g;
  const snippets = /<(?:a|div|td)\b[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/g;

  const snips: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippets.exec(html))) snips.push(stripTags(sm[1]));

  let m: RegExpExecArray | null;
  while ((m = anchor.exec(html))) {
    const attrs = m[1];
    const href = attrs.match(/href="([^"]+)"/)?.[1] ?? '';
    const url = cleanDdgUrl(href);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const title = stripTags(m[2]) || url;
    out.push({ title, url, snippet: snips[out.length] ?? '' });
    if (out.length >= limit) break;
  }
  return out;
}

/** Try the full HTML endpoint, then the lite one. */
export async function webSearch(query: string, limit = 6): Promise<SearchResult[]> {
  const q = encodeURIComponent(query.trim());
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${q}&kl=in-en`,
    `https://lite.duckduckgo.com/lite/?q=${q}`,
  ];

  let lastErr: Error | null = null;
  for (const url of endpoints) {
    try {
      const html = await httpGet(url);
      const results = parseDdgHtml(html, limit);
      if (results.length) return results;
      lastErr = new Error('No results parsed');
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error('Search failed');
}

/* ------------------------------- page read ------------------------------- */

const DROP = [
  'script',
  'style',
  'noscript',
  'svg',
  'iframe',
  'header',
  'footer',
  'nav',
  'aside',
  'form',
  'button',
  'template',
];

/** Turn raw HTML into readable text. Fast path — no browser needed. */
export function htmlToText(html: string, maxChars = 4000): string {
  let s = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of DROP) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), ' ');
  }
  // keep paragraph structure
  s = s.replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 1)
    .join('\n');

  // collapse the long runs of nav junk that survive
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > maxChars) s = s.slice(0, maxChars) + '\n…[trimmed]';
  return s;
}

export async function readPage(url: string, maxChars = 4000): Promise<string> {
  const html = await httpGet(url, 15000);
  const text = htmlToText(html, maxChars);
  if (text.length < 120) throw new Error('Page had almost no readable text');
  return text;
}

/** Title of a page, for the citation chip. */
export function pageTitle(html: string): string {
  return stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0, 80);
}

/* ------------------------------ weather -------------------------------- */

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

const CONDITION_FROM_CODE = (code: number): string => {
  if (code === 0) return 'clear sky';
  if (code <= 3) return 'partly cloudy';
  if (code <= 20) return 'foggy';
  if (code <= 50) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 82) return 'showers';
  if (code <= 113) return 'snow';
  if (code <= 119) return 'thunderstorm';
  if (code <= 176) return 'windy';
  if (code <= 200) return 'hail';
  return 'cloudy';
};

/** Geocode a city name with Open-Meteo's free geocoding API (no key). */
async function geocode(query: string): Promise<{ name: string; lat: number; lon: number } | null> {
  const q = encodeURIComponent(query.trim());
  const html = await httpGet(
    `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=1&language=en&format=json`,
    10000,
  );
  const j = JSON.parse(html);
  const result = j.results?.[0];
  if (!result) return null;
  return {
    name: [result.name, result.country].filter(Boolean).join(', '),
    lat: result.latitude,
    lon: result.longitude,
  };
}

export async function getWeather(query: string): Promise<WeatherResult> {
  const loc = await geocode(query);
  if (!loc) throw new Error(`Could not find “${query}” on the map`);

  const url = [
    OPEN_METEO,
    `?latitude=${loc.lat}&longitude=${loc.lon}`,
    '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m',
    '&timezone=auto',
  ].join('');

  const html = await httpGet(url, 12000);
  const j = JSON.parse(html);
  const cur = j.current;
  if (!cur) throw new Error('Weather endpoint returned no current data');

  return {
    city: loc.name,
    tempC: Math.round(cur.temperature_2m),
    feelsLike: Math.round(cur.apparent_temperature),
    condition: CONDITION_FROM_CODE(cur.weather_code),
    windKmh: Math.round(cur.wind_speed_10m),
    humidity: cur.relative_humidity_2m,
    query,
  };
}

/* ----------------------------- calculator ------------------------------- */

/**
 * Safe arithmetic only. No eval, no Function — a tiny recursive parser that
 * handles + - * / % ^ parentheses and unary minus, plus a few math functions
 * the model actually asks for (sqrt, abs, round, min, max, pow).
 */
export function calculate(expr: string): number {
  const s = expr.replace(/\s+/g, '');
  if (!s) throw new Error('empty expression');

  let i = 0;
  const peek = () => s[i];
  const next = () => s[i++];
  const eat = (ch: string) => {
    if (s[i] !== ch) throw new Error(`expected “${ch}” at position ${i}`);
    i++;
  };

  const parseNumber = (): number => {
    if (!/\d/.test(peek() ?? '')) throw new Error(`expected number at position ${i}`);
    let out = '';
    while (peek() && /\d/.test(peek())) out += next();
    if (peek() === '.') {
      out += next();
      while (peek() && /\d/.test(peek())) out += next();
    }
    const n = parseFloat(out);
    if (!isFinite(n)) throw new Error('invalid number');
    return n;
  };

  const parseFactor = (): number => {
    if (peek() === '-') {
      next();
      return -parseFactor();
    }
    if (peek() === '+') {
      next();
      return parseFactor();
    }
    if (peek() === '(') {
      eat('(');
      const v = parseExpr();
      eat(')');
      return v;
    }
    if (peek() && /[a-z]/i.test(peek())) {
      let name = '';
      while (peek() && /[a-zA-Z]/.test(peek())) name += next();
      if (peek() === '(') {
        eat('(');
        const args: number[] = [];
        if (peek() !== ')') {
          args.push(parseExpr());
          while (peek() === ',') {
            next();
            args.push(parseExpr());
          }
        }
        eat(')');
        return callFn(name, args);
      }
      throw new Error(`unknown name “${name}”`);
    }
    return parseNumber();
  };

  const parsePow = (): number => {
    let left = parseFactor();
    if (peek() === '^') {
      next();
      const right = parsePow(); // right-associative
      return Math.pow(left, right);
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parsePow();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const right = parsePow();
      if (op === '*') left = left * right;
      else if (op === '/') {
        if (right === 0) throw new Error('division by zero');
        left = left / right;
      } else {
        if (right === 0) throw new Error('modulo by zero');
        left = left % right;
      }
    }
    return left;
  };

  const parseExpr = (): number => {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const callFn = (name: string, args: number[]): number => {
    if (name === 'sqrt') {
      if (args.length !== 1) throw new Error('sqrt takes one argument');
      if (args[0] < 0) throw new Error('sqrt of negative');
      return Math.sqrt(args[0]);
    }
    if (name === 'abs') {
      if (args.length !== 1) throw new Error('abs takes one argument');
      return Math.abs(args[0]);
    }
    if (name === 'round') {
      if (args.length !== 1) throw new Error('round takes one argument');
      return Math.round(args[0]);
    }
    if (name === 'min') {
      if (!args.length) throw new Error('min needs at least one argument');
      return Math.min(...args);
    }
    if (name === 'max') {
      if (!args.length) throw new Error('max needs at least one argument');
      return Math.max(...args);
    }
    if (name === 'pow') {
      if (args.length !== 2) throw new Error('pow takes two arguments');
      return Math.pow(args[0], args[1]);
    }
    if (name === 'ceil') {
      if (args.length !== 1) throw new Error('ceil takes one argument');
      return Math.ceil(args[0]);
    }
    if (name === 'floor') {
      if (args.length !== 1) throw new Error('floor takes one argument');
      return Math.floor(args[0]);
    }
    throw new Error(`unknown function “${name}”`);
  };

  const result = parseExpr();
  if (i < s.length) throw new Error(`unexpected “${s[i]}” at position ${i}`);
  return result;
}

/* ------------------------------- clock -------------------------------- */

const ZONE_OFFSET = new Map<string, number>();

// Populate from Intl for the zones people actually ask about.
(function buildZoneMap() {
  const zones = [
    'Africa/Cairo',
    'America/Anchorage',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Sao_Paulo',
    'America/Argentina/Buenos_Aires',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Kolkata',
    'Asia/Dubai',
    'Asia/Singapore',
    'Asia/Bangkok',
    'Asia/Hong_Kong',
    'Asia/Seoul',
    'Asia/Jakarta',
    'Asia/Manila',
    'Asia/Karachi',
    'Asia/Kolkata',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
    'Europe/Istanbul',
    'Europe/Rome',
    'Europe/Madrid',
    'Europe/Amsterdam',
    'Europe/Stockholm',
    'Europe/Oslo',
    'Europe/Warsaw',
    'Europe/Prague',
    'Europe/Athens',
    'Europe/Helsinki',
    'Europe/Dublin',
    'Europe/Lisbon',
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Pacific/Auckland',
    'Pacific/Honolulu',
    'Pacific/Guam',
    'Indian/Maldives',
    'Indian/Reunion',
  ];
  for (const z of zones) {
    try {
      const dt = new Date().toLocaleString('en-US', { timeZone: z, hour12: false });
      // Derive offset crudely from the difference vs local — good enough for display.
      const local = Date.now();
      const tz = new Date(dt).getTime();
      if (!isNaN(tz)) ZONE_OFFSET.set(z, (tz - local) / 60000);
    } catch {}
  }
})();

const ZONE_FOR = (query: string): string | null => {
  const q = query.toLowerCase();
  if (q.includes('tokyo')) return 'Asia/Tokyo';
  if (q.includes('beijing') || q.includes('shanghai') || q.includes('china')) return 'Asia/Shanghai';
  if (q.includes('delhi') || q.includes('india')) return 'Asia/Kolkata';
  if (q.includes('dubai') || q.includes('uae') || q.includes('abudhabi')) return 'Asia/Dubai';
  if (q.includes('singapore')) return 'Asia/Singapore';
  if (q.includes('bangkok') || q.includes('thailand')) return 'Asia/Bangkok';
  if (q.includes('hong kong') || q.includes('hongkong')) return 'Asia/Hong_Kong';
  if (q.includes('seoul') || q.includes('korea')) return 'Asia/Seoul';
  if (q.includes('jakarta') || q.includes('indonesia')) return 'Asia/Jakarta';
  if (q.includes('manila') || q.includes('philippines')) return 'Asia/Manila';
  if (q.includes('karachi') || q.includes('pakistan')) return 'Asia/Karachi';
  if (q.includes('london') || q.includes('uk') || q.includes('britain')) return 'Europe/London';
  if (q.includes('paris') || q.includes('france')) return 'Europe/Paris';
  if (q.includes('berlin') || q.includes('germany')) return 'Europe/Berlin';
  if (q.includes('moscow') || q.includes('russia')) return 'Europe/Moscow';
  if (q.includes('istanbul') || q.includes('turkey')) return 'Europe/Istanbul';
  if (q.includes('rome') || q.includes('italy')) return 'Europe/Rome';
  if (q.includes('madrid') || q.includes('spain')) return 'Europe/Madrid';
  if (q.includes('amsterdam') || q.includes('netherlands')) return 'Europe/Amsterdam';
  if (q.includes('stockholm') || q.includes('sweden')) return 'Europe/Stockholm';
  if (q.includes('oslo') || q.includes('norway')) return 'Europe/Oslo';
  if (q.includes('warsaw') || q.includes('poland')) return 'Europe/Warsaw';
  if (q.includes('prague') || q.includes('czech')) return 'Europe/Prague';
  if (q.includes('athens') || q.includes('greece')) return 'Europe/Athens';
  if (q.includes('helsinki') || q.includes('finland')) return 'Europe/Helsinki';
  if (q.includes('dublin') || q.includes('ireland')) return 'Europe/Dublin';
  if (q.includes('sydney') || q.includes('australia')) return 'Australia/Sydney';
  if (q.includes('melbourne')) return 'Australia/Melbourne';
  if (q.includes('brisbane')) return 'Australia/Brisbane';
  if (q.includes('auckland') || q.includes('new zealand')) return 'Pacific/Auckland';
  if (q.includes('honolulu') || q.includes('hawaii')) return 'Pacific/Honolulu';
  if (q.includes('guam')) return 'Pacific/Guam';
  if (q.includes('cairo') || q.includes('egypt')) return 'Africa/Cairo';
  if (q.includes('anchorage') || q.includes('alaska')) return 'America/Anchorage';
  if (q.includes('los angeles') || q.includes('california') || q.includes('la')) return 'America/Los_Angeles';
  if (q.includes('denver') || q.includes('colorado')) return 'America/Denver';
  if (q.includes('chicago') || q.includes('illinois')) return 'America/Chicago';
  if (q.includes('new york') || q.includes('nyc') || q.includes('usa') || q.includes('united states')) return 'America/New_York';
  if (q.includes('sao paulo') || q.includes('brazil')) return 'America/Sao_Paulo';
  if (q.includes('buenos aires') || q.includes('argentina')) return 'America/Argentina/Buenos_Aires';
  if (q.includes('maldives')) return 'Indian/Maldives';
  if (q.includes('reunion')) return 'Indian/Reunion';
  if (q.includes('utc') || q.includes('gmt')) return 'Europe/London';
  return null;
};

export function getTime(query: string = ''): string {
  const now = new Date();

  // “what time is it” — local device time.
  if (!query.trim()) {
    return `Local time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} (${now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`;
  }

  const zone = ZONE_FOR(query);
  if (!zone) {
    // Last resort: try Intl with the raw query as a timezone hint.
    try {
      const dt = now.toLocaleString('en-US', {
        timeZone: query,
        hour12: false,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `Time in ${query}: ${dt}`;
    } catch {
      return `I don't recognise “${query}” as a place or timezone. Try a city name.`;
    }
  }

  const offset = ZONE_OFFSET.get(zone);
  const tzNow = offset != null ? new Date(now.getTime() + (offset - now.getTimezoneOffset()) * 60000) : now;
  const tz = tzNow.toLocaleString('en-US', {
    timeZone: zone,
    hour12: false,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${tz} (UTC${offset != null ? (offset >= 0 ? '+' : '') + (offset / 60).toFixed(1) : '?'})`;
}
