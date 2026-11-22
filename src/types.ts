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
  /** true when `tokens` is the provider's own usage number, not chars/4 */
  exactTokens?: boolean;
  /** wall-clock time the whole reply took, in ms (tools included) */
  latencyMs?: number;
  /** time to the first visible character, in ms */
  ttftMs?: number;
  /** measured output tokens per second */
  tps?: number;
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
  /**
   * 'device'  = Android TextToSpeech (always available, tiny)
   * 'piper'   = offline neural voice bundled in the app
   * 'kitten'  = offline neural voice bundled in the app, 8 speakers
   */
  ttsProvider: 'device' | 'piper' | 'kitten';
  /** speaker id for the neural voices (kitten only), 0-based */
  ttsVoice: number;
  /** 0.5 = half speed, 1.0 = normal, 2.0 = double */
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
  /** let the model search earlier conversations saved on this phone */
  toolsChatHistory: boolean;

  /* ---- Action Mode (phone control) ---- */
  /**
   * Master switch for the accessibility-driven automation. Off means the
   * automation tools are not even advertised to the model. Turning it on
   * still requires the user to enable "AmitAI Action Mode" in Android
   * Settings › Accessibility — this flag cannot grant that.
   */
  actionMode: boolean;
  /** second switch, so Action Mode can stay on while the agent is not allowed to drive */
  toolsAutomation: boolean;

  /* ---- storage ---- */
  /** 'default' = SharedPreferences + AsyncStorage (small, survives keychain loss).
   *  'sdcard' = app-private external files dir (large, for long chat histories).
   *  Switching to 'sdcard' migrates existing conversations over; switching back
   *  just starts reading from prefs again. Both backends are written on save so
   *  a switch in either direction never loses data. */
  storageMode: 'default' | 'sdcard';

  /* ---- backup & security ---- */
  /** write a backup into /sdcard/AmitAI/backup/ when the app goes to the background */
  autoBackup: boolean;
  /** include API keys and tokens in a manual backup (off = secrets stay on the phone) */
  backupWithKeys: boolean;
  /** ask for a PIN when the app starts, or after a minute in the background */
  appLock: boolean;
  /** sha256(salt:pin) — the PIN itself is never stored */
  pinHash: string;
  pinSalt: string;
  /** FLAG_SECURE: blocks screenshots and blanks the recents thumbnail */
  blockScreenshots: boolean;
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
  ttsVoice: 0,
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
  toolsChatHistory: true,
  actionMode: false,
  toolsAutomation: true,
  autoBackup: true,
  backupWithKeys: false,
  appLock: false,
  pinHash: '',
  pinSalt: '',
  blockScreenshots: false,
};

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
  {
    // The freebuff TUI driven through a pty: same OpenAI wire format, own agent
    // and its own tools. One turn at a time, free hours per window.
    name: 'FreeBuff Bridge',
    url: 'http://127.0.0.1:8131/v1',
    model: 'm-9a7e098cc1',
    keyHint: 'Paste BRIDGE_TOKEN from Termux · freebuff on the phone, free hours',
  },
  {
    // Not an OpenAI endpoint: the base URL is a marker that routes the request
    // through src/api/puter.ts, which speaks Puter's own driver API.
    name: 'Puter (free)',
    url: 'https://api.puter.com/drivers',
    model: 'gpt-6-luna',
    keyHint: 'Free puter.com account · tap Sign in below, no OpenAI key or card',
  },
  {
    name: 'Local (on-device)',
    url: 'http://127.0.0.1:8080/v1',
    model: 'Qwen2.5-Coder-3B',
    keyHint: 'No key needed · run llama-server in Termux · 100% offline',
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
 * freebuff's free catalogue, straight from the bridge's `/v1/models`.
 *
 * The free tier is a shared daily budget of **freebucks**, not a per-model
 * allowance: a few models cost 0 and keep working after the budget is spent,
 * the DeepSeek ones cost 5–10. `free: true` marks the 0-price ones, so they are
 * listed first — they are the ones that always answer.
 *
 * The id is freebuff's own model key; the name is what freebuff shows. Keys are
 * stable, so this list only needs a refresh when freebuff adds a model — and
 * "Test connection" always reads the live list from the bridge.
 */
export const FREEBUFF_MODELS: { model: string; name: string; hint: string; free?: boolean }[] = [
  { model: 'm-9a7e098cc1', name: 'Solar Pro 4', hint: 'Upstage flagship · 500K ctx · 0 freebucks', free: true },
  { model: 'm-69307952f8', name: 'Solar Mini 4', hint: 'Fast and light · 500K ctx · 0 freebucks', free: true },
  { model: 'm-ddc687c50f', name: 'Nemotron 3.5 Lightning', hint: 'Fast · 256K ctx · 0 freebucks', free: true },
  { model: 'm-9877f4d3ee', name: 'Beam 1.0', hint: 'Reflection + coding · 256K ctx · 0 freebucks', free: true },
  { model: 'm-02244092cb', name: 'Glyph Cluster', hint: 'Stealth preview · 256K ctx · 0 freebucks', free: true },
  { model: 'm-096e75164d', name: 'DeepSeek V4.1 Flash Fast', hint: 'Fastest · 1M ctx · 10 freebucks' },
  { model: 'm-8db1ccbba6', name: 'DeepSeek V4.1 Flash', hint: 'Steady speed · 1M ctx · 10 freebucks' },
  { model: 'm-61c26317cc', name: 'DeepSeek V4.1 Flash Slow', hint: 'Slow · cheapest · 5 freebucks' },
];

/** Human label for a model id, for chips and the live model list. */
export const modelLabel = (id: string): string =>
  FREEBUFF_MODELS.find(m => m.model === id)?.name ??
  OPENROUTER_FREE.find(m => m.model === id)?.name ??
  PUTER_MODELS.find(m => m.model === id)?.model ??
  id;

/** Why pick this model — the one-line hint under the chips. */
export const modelHint = (id: string): string | undefined =>
  FREEBUFF_MODELS.find(m => m.model === id)?.hint ?? OPENROUTER_FREE.find(m => m.model === id)?.keyHint;

/**
 * Puter's documented chat models, in the order worth trying.
 *
 * These are the ids from Puter's own tutorials; the catalogue also lists
 * `provider:model` forms (`openrouter:openai/gpt-6-luna`), and these are the
 * aliases that resolve to them. Kept short on purpose — the full catalogue is
 * ~900 entries, and "Test connection" lists it if you want to go hunting.
 */
export const PUTER_MODELS: { model: string; note: string }[] = [
  { model: 'gpt-6-luna', note: 'cheapest · chat, summaries' },
  { model: 'gpt-5.4-nano', note: 'fast · short answers' },
  { model: 'gpt-6.1-sol', note: 'mid-tier · everyday coding' },
  { model: 'gpt-6-astra', note: 'flagship · hardest problems' },
  { model: 'openai/gpt-oss-120b', note: 'open weights · reasoning' },
  { model: 'openai/gpt-5.3-codex', note: 'code generation' },
];

export const puterNoteFor = (model: string): string | undefined =>
  PUTER_MODELS.find(m => m.model === model)?.note;

/** KittenTTS nano v0.8 voices, in speaker-id order (index = ttsVoice). */
export const KITTEN_VOICES: { id: number; name: string; note: string }[] = [
  { id: 0, name: 'Bella', note: 'soft, warm' },
  { id: 1, name: 'Jasper', note: 'deep, neutral' },
  { id: 2, name: 'Luna', note: 'bright' },
  { id: 3, name: 'Bruno', note: 'low, calm' },
  { id: 4, name: 'Rosie', note: 'friendly' },
  { id: 5, name: 'Hugo', note: 'narration' },
  { id: 6, name: 'Kiki', note: 'light' },
  { id: 7, name: 'Leo', note: 'even' },
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
