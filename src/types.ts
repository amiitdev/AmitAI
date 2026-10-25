export type Role = 'system' | 'user' | 'assistant';

export type ThemeKey = 'midnight' | 'tokyo' | 'obsidian';

export interface Source {
  title: string;
  url: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  model?: string;
  /** approximate token count, filled after a reply finishes */
  tokens?: number;
  /** local file uri of an attached image (vision models only) */
  imageUri?: string;
  /** base64 data URL built at send time; never persisted */
  imageData?: string;
  /** 1-8 attached images, local file uris (3.7+) */
  imageUris?: string[];
  /** data URLs for the same images, built at send time; never persisted */
  imageDatas?: string[];
  /** true while the assistant is still streaming into this message */
  streaming?: boolean;
  error?: string;
  /** web pages the answer was built from */
  sources?: Source[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface Settings {
  apiKey: string;
  /** key kept per provider name, so switching Gemini ↔ OpenRouter keeps both */
  providerKeys: Record<string, string>;
  /** anything OpenAI-compatible: api.openai.com, a gateway, Ollama, LM Studio, OpenRouter */
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  stream: boolean;
  /** 'low' | 'medium' | 'high' — only sent to reasoning models */
  reasoningEffort: 'off' | 'low' | 'medium' | 'high';
  haptics: boolean;

  /* ---- web access ---- */
  /** let the model search the web */
  webSearch: boolean;
  /** let the model open the pages it finds */
  webRead: boolean;
  /** 'fetch' = fast HTML strip, 'browser' = render JS in a hidden WebView */
  readerMode: 'fetch' | 'browser';
  /** how many pages it may open per answer */
  maxPages: number;

  /* ---- voice ---- */
  /** 'device' = Android TextToSpeech (free, instant), 'elevenlabs' = cloud */
  ttsProvider: 'device' | 'elevenlabs';
  elevenLabsKey: string;
  elevenLabsVoiceId: string;
  /** 0.5 = half speed, 1.0 = normal, 2.0 = double (device voice) */
  ttsSpeed: number;

  /* ---- diagnostics ---- */
  /** Return a synthetic Google-style 429 instead of calling the network,
   *  so the quota display can be exercised on demand. */
  simulate429: boolean;

  /* ---- appearance ---- */
  theme: ThemeKey;

  /* ---- tools ---- */
  /** let the model look up current weather (Open-Meteo, no key) */
  toolsWeather: boolean;
  /** let the model do arithmetic via a safe local calculator */
  toolsCalculator: boolean;
  /** let the model read the current time / timezone for a city */
  toolsTime: boolean;
  /** let the model read whatever the user last copied */
  toolsClipboard: boolean;
  /** let the model save and search notes that survive restarts */
  toolsMemory: boolean;
  /** let the model create recurring jobs that answer by notification */
  toolsSchedules: boolean;

  /* ---- storage ---- */
  /** 'default' = SharedPreferences + AsyncStorage (small, survives keychain loss).
   *  'sdcard' = app-private external files dir (large, for long chat histories).
   *  Switching to 'sdcard' migrates existing conversations over; switching back
   *  just starts reading from prefs again. Both backends are written on save so
   *  a switch in either direction never loses data. */
  storageMode: 'default' | 'sdcard';
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  providerKeys: {},
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5.1',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt: 'You are AmitAI, a concise, direct assistant. Prefer short answers. Use markdown for code.',
  stream: true,
  reasoningEffort: 'low',
  haptics: true,
  webSearch: true,
  webRead: true,
  readerMode: 'fetch',
  maxPages: 3,
  ttsProvider: 'device',
  elevenLabsKey: '',
  elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB',
  ttsSpeed: 1,
  simulate429: false,
  theme: 'midnight',
  storageMode: 'default',
  toolsWeather: true,
  toolsCalculator: true,
  toolsTime: true,
  toolsClipboard: true,
  toolsMemory: true,
  toolsSchedules: true,
};

export const ELEVEN_MODEL = 'eleven_flash_v2_5';

/* ------------------------------------------------------------------ */
/* Providers — everything speaks the OpenAI wire format                */
/* ------------------------------------------------------------------ */

export interface ProviderDef {
  name: string;
  url: string;
  model: string;
  /** short note shown under the API key field */
  keyHint: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    name: 'Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash',
    keyHint: 'Google AI Studio key · free tier, quota per model per day',
  },
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    model: 'nvidia/nemotron-3.5-super-vl:free',
    keyHint: 'sk-or-v1-... · free models need no credits',
  },
  {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1',
    model: 'gpt-5.1',
    keyHint: 'sk-... · paid',
  },
  {
    name: 'AmitAI Bridge (free)',
    url: 'http://127.0.0.1:8130/v1',
    model: 'opencode-free/deepseek-v4.1-flash-free',
    keyHint: 'Paste BRIDGE_TOKEN from Termux · phone-local, free models',
  },
];

/**
 * OpenRouter's best **free** models, hand-tested for coding and reasoning
 * (a request producing real code + a reasoning trace was required for each).
 *
 * Excluded on purpose: poolside/laguna-* and cohere/north-mini-code burn their
 * entire token budget on reasoning and never emit an answer; gemma-4-* was in
 * permanent 429; inkling* returned 403; nemotron-3-super-120b was 404.
 */
export const OPENROUTER_FREE: ProviderDef[] = [
  {
    name: 'nvidia/nemotron-3.5-super-vl:free',
    url: 'https://openrouter.ai/api/v1',
    model: 'nvidia/nemotron-3.5-super-vl:free',
    keyHint: 'best all-round · coding + vision · 1M ctx',
  },
  {
    name: 'dots-studio/dots-3-note-preview:free',
    url: 'https://openrouter.ai/api/v1',
    model: 'dots-studio/dots-3-note-preview:free',
    keyHint: 'fast coding · detailed explanations · 512K ctx',
  },
  {
    name: 'recursive/flint-v1.0:free',
    url: 'https://openrouter.ai/api/v1',
    model: 'recursive/flint-v1.0:free',
    keyHint: 'fastest replies (~6 s) · light reasoning · 256K ctx',
  },
  {
    name: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    url: 'https://openrouter.ai/api/v1',
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    keyHint: 'deepest reasoning · slower (~85 s) · 1M ctx',
  },
  {
    name: 'nvidia/nemotron-3.5-lightning:free',
    url: 'https://openrouter.ai/api/v1',
    model: 'nvidia/nemotron-3.5-lightning:free',
    keyHint: 'quick thinking · 1M ctx',
  },
  {
    name: 'xingchen-agi/xing4.0-29b-a4b:free',
    url: 'https://openrouter.ai/api/v1',
    model: 'xingchen-agi/xing4.0-29b-a4b:free',
    keyHint: 'solid backup coder · 256K ctx',
  },
];

export const providerByName = (name: string): ProviderDef | undefined =>
  PROVIDERS.find(p => p.name === name);

/**
 * Voices verified to work on ElevenLabs' free tier via the API.
 * Library voices (e.g. Rachel) return 402 paid_plan_required, so they are not
 * listed — picking one would only produce an error at speak time.
 */
export const ELEVEN_VOICES: { id: string; name: string; note: string }[] = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', note: 'deep, neutral' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', note: 'soft, warm' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', note: 'bright, even' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', note: 'news-anchor' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', note: 'friendly' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', note: 'narration' },
];

/** Rough $ per 1M tokens, for the cost readout. Update as prices move. */
export const PRICES: Record<string, { in: number; out: number }> = {
  'gpt-5.1': { in: 1.25, out: 10 },
  'gpt-5.1-mini': { in: 0.25, out: 2 },
  'gpt-5': { in: 1.25, out: 10 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
};

export interface Preset {
  id: string;
  name: string;
  emoji: string;
  prompt: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'default',
    name: 'Default',
    emoji: '💬',
    prompt: DEFAULT_SETTINGS.systemPrompt,
  },
  {
    id: 'code',
    name: 'Code reviewer',
    emoji: '🧑‍💻',
    prompt:
      'You are a senior engineer doing code review. Point at the exact line, say what breaks and why, then give the corrected snippet. No praise, no summary of what the code does. If something is fine, stay silent about it.',
  },
  {
    id: 'teach',
    name: 'Tutor',
    emoji: '📚',
    prompt:
      'You are a patient tutor. Start with an everyday analogy in plain words, then name the technical term, then one small worked example. Never dump a list of facts. Ask one check question at the end.',
  },
  {
    id: 'network',
    name: 'Network engineer',
    emoji: '🌐',
    prompt:
      'You are a network engineer. Answer with the OSI/TCP-IP layer first, then the exact commands to prove it on Linux. Prefer tcpdump/ip/bridge/ss over theory. Show real output format.',
  },
  {
    id: 'write',
    name: 'Editor',
    emoji: '✍️',
    prompt:
      'You are a ruthless copy editor. Keep the author\'s voice. Cut filler, fix structure, return only the edited text plus a two-line note on what you changed.',
  },
];
