<div align="center">

<img src="assets/icon.jpg" width="120" alt="AmitAI icon" />

# AmitAI

### Your own AI assistant — your code, your key, your phone.

A native Android AI assistant built with **React Native + Kotlin**.
Streaming chat, on-device web search, five local tools, hands-free voice,
an offline “Ok Amit” wake word and a floating bubble — with **no telemetry, no account, no middleman**.

[![Download](https://img.shields.io/badge/⬇_Download-APK-6366f1?style=for-the-badge)](https://github.com/amiitdev/AmitAI/releases/latest)
[![Platform](https://img.shields.io/badge/Android-7.0%2B-3ddc84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/amiitdev/AmitAI/releases/latest)
[![React Native](https://img.shields.io/badge/React_Native-0.88-61dafb?style=for-the-badge&logo=react&logoColor=061a23)](https://reactnative.dev)
[![Kotlin](https://img.shields.io/badge/Kotlin-2.2-7f52ff?style=for-the-badge&logo=kotlin&logoColor=white)](https://kotlinlang.org)

![Version](https://img.shields.io/badge/version-3.6-6366f1?style=flat-square)
![Tests](https://img.shields.io/badge/tests-38_passed-10b981?style=flat-square)
![TypeScript](https://img.shields.io/badge/tsc-0_errors-3178c6?style=flat-square&logo=typescript&logoColor=white)

</div>

---

## ⬇ Download

The newest build is **3.6** (`versionCode 9`). Every APK ever shipped is on the
[**Releases page**](https://github.com/amiitdev/AmitAI/releases).

| Version | What changed | Size | Link |
|---|---|---|---|
| **3.6** | Storage modes, chat files, latest tools | 101 MB | [AmitAI-3.6.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.6/AmitAI-3.6.apk) |
| 3.5 | Quota + usage dashboard | 101 MB | [AmitAI-3.5.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.5/AmitAI-3.5.apk) |
| 3.4 | Barge-in, better voice loop | 101 MB | [AmitAI-3.4.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.4/AmitAI-3.4.apk) |
| 3.3 | **Offline wake word** (“Ok Amit”) + floating bubble | 101 MB | [AmitAI-3.3-wakeword.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.3-wakeword/AmitAI-3.3-wakeword.apk) |
| 3.2 | Tools: weather, calculator, time | 66 MB | [AmitAI-3.2.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.2/AmitAI-3.2.apk) |
| 3.1 | First public build | 65 MB | [AmitAI-3.1.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.1/AmitAI-3.1.apk) |

<details>
<summary><b>Install steps (30 seconds)</b></summary>

1. Download the APK on the phone.
2. Tap it → Android asks to allow installs from this app → **Allow**.
3. Open **AmitAI** → ☰ → **Settings**.
4. Pick a provider (Gemini / OpenRouter / OpenAI / local bridge) **or** paste any
   OpenAI-compatible base URL.
5. Paste the key → **Test connection** → it lists the models that endpoint serves.
6. Back → type.

No key? Point the Base URL at a local **Ollama** (`http://<laptop-ip>:11434/v1`)
or the phone-local **AmitAI Bridge** (`http://127.0.0.1:8130/v1`).

> The APKs are signed with the Android **debug** keystore (like many side-loaded
> builds). Consequence: they install fine, but Play Protect may warn, and a future
> build signed with a different key cannot update over this one without uninstalling.
> Android 7.0 (API 24) or newer, `arm64-v8a` / `armeabi-v7a` / `x86_64`.

</details>

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [Feature tour](#2-feature-tour)
3. [Screens and flows](#3-screens-and-flows)
4. [Tech stack](#4-tech-stack)
5. [Architecture](#5-architecture)
6. [How streaming and tool calls work](#6-how-streaming-and-tool-calls-work)
7. [The voice stack](#7-the-voice-stack)
8. [File map](#8-file-map)
9. [Build from source](#9-build-from-source)
10. [Checks and real output](#10-checks-and-real-output)
11. [Settings reference](#11-settings-reference)
12. [Providers and free models](#12-providers-and-free-models)
13. [Storage and privacy](#13-storage-and-privacy)
14. [Permissions, honestly explained](#14-permissions-honestly-explained)
15. [Release history](#15-release-history)
16. [Known limits and roadmap](#16-known-limits-and-roadmap)
17. [Why this is not a ChatGPT clone](#17-why-this-is-not-a-chatgpt-clone)
18. [Credits](#18-credits)

---

## 1. What this is

AmitAI is a **complete, working AI assistant app** that runs entirely on the phone.
There is no AmitAI server: the app talks straight from your device to whichever model
endpoint you choose, and every tool (search, page reader, weather, calculator, clock)
runs locally.

```
   ┌──────────────┐        HTTPS (your key)         ┌──────────────────┐
   │   AmitAI     │ ──────────────────────────────▶ │  Gemini / OpenAI │
   │  on Android  │ ◀────── streamed tokens ─────── │  OpenRouter / …  │
   └──────┬───────┘                                 └──────────────────┘
          │
          ├── DuckDuckGo HTML   (search, no key)
          ├── Open-Meteo        (weather, no key)
          ├── local calculator  (pure JS)
          ├── local clock       (Intl / JS)
          ├── hidden WebView    (JS-heavy pages)
          └── Vosk 40 MB model  (offline wake word)
```

**What makes it different from a chat wrapper**

| | Typical wrapper | AmitAI |
|---|---|---|
| Streaming | often fake or chunked-after-complete | real SSE parsed from `XMLHttpRequest.onprogress` |
| Tools | none, or a server you must host | 5 tools executing on-device |
| Voice | one button, cloud STT | continuous loop + barge-in + offline wake word |
| Storage | server account | JSON on the phone, optional `/sdcard/AmitAI` |
| Provider | one | Gemini, OpenRouter, OpenAI, Ollama, any compatible URL |
| Telemetry | usually some | **zero** — no analytics, no crash SDK, no ads |

---

## 2. Feature tour

### 💬 Chat and streaming

| Feature | Detail |
|---|---|
| Token-by-token streaming | SSE parsed live; answers type out as they arrive |
| Stop mid-answer | aborts the request and keeps the partial reply |
| Regenerate | re-runs the last turn against the same context |
| Edit-free resend | copy any reply, attach an image, send again |
| Auto titles | first user line becomes the chat title |
| Pin / rename / delete | long-press or the drawer menu |
| Full-text search | searches every message, not just titles |
| Copy / share | per-message copy, code-block copy, Android share sheet |
| Token + cost readout | per reply, from the model and a local price table |
| Error surfacing | 401 / 402 / 429 / network errors explained in plain words |

### 🎨 Rendering

| Feature | Detail |
|---|---|
| Markdown | headings, bold, italic, strikethrough, quotes, lists, links, rules |
| Tables | real column layout, not pipes |
| Fenced code | language label, monospace, horizontal scroll, **per-block copy** |
| Inline code | distinct background, wraps instead of overflowing |
| Citations | host chips under answers that used the web |
| Streaming caret | blinking block while tokens arrive |

### 🧠 Models and providers

| Feature | Detail |
|---|---|
| 4 one-tap providers | Gemini · OpenRouter · OpenAI · AmitAI Bridge (phone-local) |
| Any OpenAI-compatible URL | Ollama, LM Studio, vLLM, gateways, self-hosted |
| Per-provider key vault | switching Gemini ↔ OpenRouter keeps **both** keys |
| Live model list | `GET /models` on *Test connection*; pick from what really exists |
| Free-model catalogue | 6 hand-tested OpenRouter free models with notes |
| Reasoning effort | `off / low / medium / high`, only sent to reasoning models |
| Temperature, max tokens, stream on/off | all adjustable |
| Personas | Default, Code reviewer, Tutor, Network engineer, Editor |

### 🛠 On-device tools

| Tool | Backend | Key needed |
|---|---|---|
| `web_search` | DuckDuckGo HTML → `lite.duckduckgo.com` fallback | no |
| `open_page` | fetch + HTML→text, or a hidden WebView for JS pages | no |
| `get_weather` | Open-Meteo geocoding + forecast | no |
| `calculate` | safe expression parser (no `eval`) | no |
| `get_time` | IANA timezones via `Intl` | no |

The model decides when to call them. Each tool can be switched off in
Settings → Tools, and there is a page budget (default 3) so a curious model cannot
burn your tokens reading 20 pages.

### 🎙 Voice

| Feature | Detail |
|---|---|
| Voice input | Android `SpeechRecognizer` with partial results (words appear while you talk) |
| Read aloud | Android `TextToSpeech` — free, offline, adjustable speed 0.5×–2.0× |
| Cloud voice | ElevenLabs `eleven_flash_v2_5`, 6 free-tier voices |
| Voice mode | hands-free listen → think → speak → listen loop |
| **Barge-in** | talk over the answer to cut it off; echo guard stops it hearing itself |
| Stop words | “stop”, “wait”, “no”, “cancel”, … interrupt instantly |
| **“Ok Amit” wake word** | offline Vosk model (~40 MB, downloaded once) |
| **Floating bubble** | draggable “A” overlay; tap → voice mode |
| Boot restore | wake listener returns after a reboot if you enabled it |
| Mic arbitration | in-app mic always wins over the background listener |

### 🗂 Conversations and storage

| Feature | Detail |
|---|---|
| Persistence | AsyncStorage + SharedPreferences, written through both |
| Big-history mode | app-private external files dir (`/sdcard/AmitAI`) |
| Visible files | one JSON conversation store you can back up |
| Storage panel | folder, free space, all-files grant, one-tap migrate |
| Trim safety | past ~1.5 MB the oldest replies are stubbed, never a failed write |
| Migrations | new settings fields merge over defaults, so upgrades never break |

### 📊 Usage, quota and diagnostics

| Feature | Detail |
|---|---|
| Weekly usage | requests, input tokens, output tokens, estimated $ |
| Free-tier quota | counts requests per model per day |
| 429 learning | parses Google's `limit: 20` and `retry in 30m` from the error body |
| Model picker hints | `Quota: 7/20 used today`, `⛔ resets in 12 min` |
| Simulate 429 | diagnostics toggle to exercise the UI offline |
| Reset counters | one tap |

### 🌑 Appearance

| Theme | Look |
|---|---|
| **Midnight OLED** | pure `#000` AMOLED, electric indigo |
| **Tokyo Night** | deep navy, neon cyan and lavender |
| **Cyber Obsidian** | carbon black, cyber emerald |

Plus an animated splash (ken-burns background + spring logo) and edge-to-edge
keyboard handling that lifts the composer by the real IME height.

---

## 3. Screens and flows

```
┌─────────────────────────────────────────────────────────────┐
│  ☰   AmitAI                              📞 voice   🎨      │  header
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌────────────────────────────────────┐                    │
│   │ you                                │                    │
│   │ explain ARP in one line            │                    │
│   └────────────────────────────────────┘                    │
│                                                             │
│   AMITAI                                                    │
│   ARP maps an IP address to a MAC address on the local      │
│   network, by shouting “who has 10.0.0.1?”                  │
│   [ host chip ]   copy · speak · regenerate · 42 tok        │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [+]  [🌐]  ┌──────────────────────────────┐  🎙   ➤        │  composer
│             │ Message AmitAI…              │                │
│             └──────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
        ▲                    ▲                     ▲
        │                    │                     │
   drawer: chats      settings: everything    voice mode overlay
```

**Voice mode states**

```
        ┌──────────────────────────────────────────┐
        │                                          │
        ▼                                          │
   🎙 listening ──final transcript──▶ 🧠 thinking   │
        ▲                                 │         │
        │                          answer text      │
        │                                 ▼         │
        └──── TTS "finished" event ── 🔊 speaking ───┘
                 ▲
                 └── you start talking → barge-in cuts the audio
```

**Wake word path**

```
 mic ──▶ Vosk (offline, tiny grammar) ──▶ "ok amit"
                                              │
                         foreground service ──┤── notification card
                         policy check ────────┤── charging / screen-off / always
                         mic gate ────────────┤── yields while app is open
                                              ▼
                                   open AmitAI in voice mode
```

---

## 4. Tech stack

| Layer | Choice | Version |
|---|---|---|
| UI runtime | React Native (new architecture, Hermes) | 0.88.0 |
| UI library | React | 19.3.0 |
| Language (JS) | TypeScript | 6.0.3 |
| Language (native) | Kotlin | 2.2.0 |
| Android build | Gradle / AGP | 9.4.1 |
| SDKs | compile 37 · target 36 · min 24 |
| NDK | 27.1.12297006 |
| Persistence | `@react-native-async-storage/async-storage` | 3.1.1 |
| Native storage | `SharedPreferences` + app-private external files |
| Icons | `@react-native-vector-icons/ionicons` | 14.0.0 |
| Images | `react-native-image-picker` | 8.3.0 |
| Safe areas | `react-native-safe-area-context` | 5.5.2 |
| SVG | `react-native-svg` | 15.16.0 |
| Hidden browser | `react-native-webview` | 14.0.1 |
| Wake word | `com.alphacephei:vosk-android` | 0.3.47 |
| FFI for Vosk | `net.java.dev.jna:jna` | 5.13.0 |
| Tests | Jest + `react-test-renderer` | 29.6.3 |
| Lint / format | ESLint + Prettier | 8.x / 2.8.8 |

**Zero extra AI SDKs.** The OpenAI wire format is implemented by hand
(`src/api/openai.ts`) so the app can point at *any* compatible endpoint, including
one running on the same phone.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            App.tsx (778 lines)                       │
│  state: settings · conversations · activeId · screen · streaming     │
│  actions: send · stop · regenerate · newChat · pin · rename · delete │
└───────┬───────────────────────────┬────────────────────┬────────────┘
        │                           │                    │
 ┌──────▼─────────┐        ┌────────▼─────────┐   ┌──────▼──────────┐
 │  components/   │        │  api/openai.ts    │   │ screens/         │
 │  Bubble        │        │  runAgent()       │   │ SettingsScreen   │
 │  Composer      │        │   ├ SSE stream    │   │ VoiceMode        │
 │  Conversation  │        │   └ tool loop     │   └──────┬──────────┘
 │  Markdown      │        └────────┬──────────┘          │
 │  CodeBlock     │                 │                     │
 │  Sheet/Toast   │        ┌────────▼──────────┐          │
 │  WebReader     │        │  lib/agentTools   │          │
 └──────┬─────────┘        │  executor + budget│          │
        │                  └────────┬──────────┘          │
        │                           │                     │
 ┌──────▼─────────┐        ┌────────▼──────────┐   ┌──────▼──────────┐
 │ storage/store  │        │  api/tools.ts      │   │ lib/assistant    │
 │ prefs + AS + SD│        │  search/page/…     │   │ lib/native       │
 └──────┬─────────┘        └───────────────────┘   │ lib/speech       │
        │                                            │ lib/barge        │
        │                                            └──────┬──────────┘
        │                                                   │ bridge
        │            ┌──────────────────────────────────────▼─────────┐
        │            │           Kotlin native layer                    │
        └───────────▶│ AmitVoiceModule   STT · TTS · clips · storage    │
                     │ AmitAssistant     wake · bubble · policy         │
                     │ WakeWordService   Vosk · foreground · wakelock   │
                     │ BubbleService     overlay window                 │
                     │ BootReceiver      restore after reboot           │
                     │ MicGate           one mic, in-app wins           │
                     └──────────────────────────────────────────────────┘
```

**Every native bridge is optional.** If a module is missing, `hasVoice` /
`hasAssistant` are false and the related UI hides itself instead of crashing —
so the JS can run in a plain RN shell and Jest without stubs for everything.

---

## 6. How streaming and tool calls work

React Native's `fetch` does **not** expose a readable body stream (`res.body` is
`undefined`), so `fetch` can only hand you a finished answer. `XMLHttpRequest`
does report progress, so streaming is built on it:

```ts
xhr.onprogress = () => {
  const text = xhr.responseText;        // everything received so far
  const slice = text.slice(seen);       // only the new bytes
  seen = text.length;

  for (const line of (carry + slice).split('\n')) {
    if (line.startsWith('data:')) parseEvent(line.slice(5).trim());
  }
};
```

Three details that are easy to get wrong:

| Trap | Handling |
|---|---|
| A chunk can end mid-line | `carry` holds the incomplete tail |
| `[DONE]` finalises the stream | checked before `JSON.parse` |
| Errors arrive as JSON, not SSE | `json.error.message` surfaced as `ApiError` |

**The agent loop** (max 3 rounds):

```
round 1  ──▶ POST messages + tools[web_search, open_page, weather, calc, time]
              │
              ├─ no tool_calls ──▶ done
              │
              └─ tool_calls ──▶ execute locally
                                  ├ web_search  → DDG HTML
                                  ├ open_page   → fetch | hidden WebView
                                  ├ get_weather → Open-Meteo
                                  ├ calculate   → parser
                                  └ get_time    → Intl
                                        │
round 2  ◀──── append role:"tool" results, ask again ────────┘
```

Streaming tool calls arrive as **fragments keyed by `index`**, so name and
arguments are merged across chunks before the JSON is parsed. A 60 ms buffer
batches UI updates: a fast model emits 50+ deltas per second, and one `setState`
per delta drops frames on a 200-message thread.

---

## 7. The voice stack

### Two speech engines

| | Device (default) | ElevenLabs |
|---|---|---|
| Cost | free | free tier quota |
| Latency | instant, offline | ~1–2 s per reply |
| Quality | robotic | natural |
| Setup | none | paste an API key |

ElevenLabs runs through Kotlin (`MediaPlayer` + `xi-api-key` header) because the
HTTP call and MP3 playback don't belong in JS. Only voices that actually work on
the free tier are listed — library voices like Rachel return
`402 paid_plan_required`.

### Barge-in without self-interruption

While the assistant speaks, the mic is open for interruptions. The loudspeaker
bleeds into the microphone, so the recognizer often transcribes the assistant's
own sentence. That must not count as an interruption:

```
 heard:  "the arp table maps ip to mac"
 spoken: "the arp table maps ip to mac addresses"
         └──────── overlap ≈ 0.86 → it is the phone hearing itself → ignore
```

Word-set overlap above **0.4** is treated as echo; below it, the user is genuinely
talking. Single-word commands (`stop`, `wait`, `no`, `cancel`, …) always interrupt.

### Wake word engineering notes

| Problem | Solution |
|---|---|
| General ASR is expensive to keep on | Vosk with a tiny grammar — only “amit” vs noise |
| Battery drain | policy: charging/screen-off, always, or paused |
| Two apps want the mic | `MicGate` yields while AmitAI is foreground |
| OEM kills the service | foreground notification + battery-exemption request |
| Reboot loses it | `BootReceiver` restarts the listener if enabled |
| Model download | one-time ~40 MB, progress events, delete button |
| Privacy | audio samples are dropped after recognition, never stored or uploaded |

---

## 8. File map

```
AmitAI/
├── App.tsx                         root: state, streaming, drawer, header
├── index.js                        registers <App/>
├── assets/                         icon + splash art
├── releases/                       APK index + checksums (binaries live on Releases)
├── __tests__/                      6 suites, 38 tests
└── src/
    ├── types.ts                    Message, Conversation, Settings, providers,
    │                               PRESETS, PRICES, ElevenLabs voices
    ├── theme.ts                    3 themes + tokens (space, radius, font)
    ├── api/
    │   ├── openai.ts               runAgent: SSE + tool loop, ping, image → data URL
    │   └── tools.ts                DDG search, HTML→text, weather, calc, time
    ├── storage/store.ts            AsyncStorage + prefs + external-file backend
    ├── lib/
    │   ├── native.ts               JS side of the voice bridge, picker, clipboard
    │   ├── assistant.ts            wake word / bubble / permissions bridge
    │   ├── agentTools.ts           tool schemas + executor + page budget
    │   ├── reader.ts               queue between tools and the hidden WebView
    │   ├── speech.ts               one-speaker-at-a-time TTS state
    │   ├── barge.ts                echo guard + stop words
    │   ├── quota.ts                per-model daily counters, 429 learning
    │   ├── usage.ts                weekly requests/tokens/cost
    │   └── useKeyboard.ts          edge-to-edge IME inset handling
    ├── components/
    │   ├── Bubble.tsx              user bubble vs assistant markdown + actions
    │   ├── Composer.tsx            input, attach, mic, web toggle, send/stop
    │   ├── Markdown.tsx            dependency-free renderer (tables included)
    │   ├── CodeBlock.tsx           syntax colour + per-block copy
    │   ├── ConversationList.tsx    search, new, pin, rename, delete
    │   ├── Sheet.tsx               bottom sheet + rename dialog
    │   ├── Toast.tsx               toast provider
    │   ├── WebReader.tsx           hidden WebView for open_page
    │   ├── AssistantSection.tsx    wake word, bubble, listening policy
    │   ├── StorageSection.tsx      folder, free space, all-files grant
    │   └── SplashScreen.tsx        animated splash
    └── screens/
        ├── SettingsScreen.tsx      ~800 lines, every switch documented below
        └── VoiceMode.tsx           hands-free loop + barge-in

android/app/src/main/java/com/amit/ai/
├── MainActivity.kt / MainApplication.kt
├── AmitVoiceModule.kt              STT · TTS · ElevenLabs · clipboard · storage
├── AmitVoicePackage.kt             registers the module
├── AmitAssistantModule.kt          wake · bubble · policy · model download
├── AssistantBus.kt / AssistantPrefs.kt
├── WakeWordService.kt              Vosk foreground listener
├── BubbleService.kt                draggable overlay
├── BootReceiver.kt                 restore after reboot
└── MicGate.kt                      mic arbitration
```

---

## 9. Build from source

### Prerequisites

| Need | Version |
|---|---|
| Node | ≥ 22.11 |
| JDK | 17+ |
| Android SDK | platform 37, build-tools 37 |
| Android NDK | 27.1.12297006 |
| Device / emulator | Android 7.0+ |

### Debug

```bash
git clone https://github.com/amiitdev/AmitAI.git
cd AmitAI
npm install

npx react-native start                    # Metro, terminal 1
cd android && ./gradlew assembleDebug     # terminal 2
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Release (standalone, no Metro)

```bash
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

The release variant embeds the JS bundle, so the app cold-starts alone. To ship
updates properly, generate your own keystore and point `signingConfigs.release`
at it — this repo uses the debug key so that side-loading is frictionless.

### Local model (Ollama)

```bash
OLLAMA_HOST=0.0.0.0 ollama serve
ollama pull qwen2.5:7b
```

| Field | Value |
|---|---|
| Base URL | `http://<laptop-lan-ip>:11434/v1` |
| API key | empty |
| Model | `qwen2.5:7b` |

Free, offline, private — slower and weaker than hosted models, but nothing leaves
the LAN.

---

## 10. Checks and real output

```bash
$ npx tsc --noEmit
$ echo $?
0
```

```bash
$ npx jest --silent
PASS __tests__/VoiceAndTheme.test.tsx
PASS __tests__/SpeechState.test.tsx
PASS __tests__/MarkdownTable.test.tsx
PASS __tests__/App.test.tsx
PASS __tests__/SettingsProviders.test.tsx
PASS __tests__/VoiceLoop.test.tsx

Test Suites: 6 passed, 6 total
Tests:       38 passed, 38 total
Snapshots:   0 total
Time:        6.325 s
```

What the suites cover:

| Suite | Locks down |
|---|---|
| `App.test.tsx` | the app renders and the shell mounts |
| `MarkdownTable.test.tsx` | table parsing and table rendering |
| `SettingsProviders.test.tsx` | per-provider key switching without losing others |
| `SpeechState.test.tsx` | TTS utterance ids, start/end/error events |
| `VoiceAndTheme.test.tsx` | barge-in echo guard, stop words, theme tokens |
| `VoiceLoop.test.tsx` | the listen → think → speak loop and its timers |

Build artefacts (APK 3.6):

```
$ apkanalyzer manifest print AmitAI-3.6.apk | head
package="com.amit.ai"
android:versionCode="9"
android:versionName="3.6"
android:minSdkVersion="24"
android:targetSdkVersion="36"

$ unzip -l AmitAI-3.6.apk | grep libvosk
8862928  lib/arm64-v8a/libvosk.so
8279808  lib/armeabi-v7a/libvosk.so
...

$ ls -lh AmitAI-3.6.apk
101M
```

---

## 11. Settings reference

| Section | Setting | Default | What it does |
|---|---|---|---|
| Appearance | Theme | Midnight OLED | Midnight / Tokyo Night / Cyber Obsidian |
| Connection | Provider chips | Gemini | fills base URL + model + key hint |
| Connection | Base URL | `https://api.openai.com/v1` | any OpenAI-compatible root |
| Connection | API key | empty | stored per provider, sent only in `Authorization` |
| Connection | Test connection | — | `GET /models`, lists what the endpoint serves |
| Model | Model id | `gpt-5.1` | free text; chips for the current provider |
| Generation | Temperature | 0.7 | 0 deterministic → 2 wild |
| Generation | Max tokens | 2048 | reply cap |
| Generation | Stream | on | off = one JSON response |
| Generation | Reasoning effort | low | only attached for reasoning models |
| Generation | System prompt | AmitAI default | sent as the `system` message |
| Tools | Web search | on | advertise `web_search` |
| Tools | Open pages | on | advertise `open_page` |
| Tools | Weather / Calculator / Time | on | advertise the local tools |
| Web access | Page reader | Fast | Fast = fetch + strip · Browser = hidden WebView |
| Web access | Pages per answer | 3 | hard budget (1–6) |
| Voice | Speaking voice | Device | Device TTS or ElevenLabs |
| Voice | Speaking speed | 1.0× | 0.5×–2.0× |
| Voice | ElevenLabs key / voice | empty / Adam | 6 free-tier voices |
| Voice | Test this voice | — | speaks one sample sentence |
| Ok Amit | Wake word | off | offline Vosk listener |
| Ok Amit | Floating bubble | off | overlay permission needed |
| Ok Amit | When to listen | Charging / screen off | charging · always · paused |
| Chat files | Folder | app external dir | shows path and free space |
| Chat files | Move to `/sdcard/AmitAI` | — | needs all-files access |
| Usage | This week | — | requests, tokens in/out, est. cost |
| Diagnostics | Simulate 429 | off | exercise quota UI without the network |
| Diagnostics | Reset counters | — | clears quota + usage |
| Persona | Preset | Default | replaces the system prompt |

---

## 12. Providers and free models

| Provider | Base URL | Default model | Key |
|---|---|---|---|
| **Gemini** | `generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.5-flash` | AI Studio, free tier |
| **OpenRouter** | `openrouter.ai/api/v1` | `nvidia/nemotron-3.5-super-vl:free` | `sk-or-v1-…` |
| **OpenAI** | `api.openai.com/v1` | `gpt-5.1` | paid |
| **AmitAI Bridge** | `127.0.0.1:8130/v1` | `opencode-free/deepseek-v4.1-flash-free` | local token |

### The free-model shortlist

Each of these was picked only after producing real code + reasoning. The rejects
are documented too, because that is the useful part:

| Model | Why it is on the list |
|---|---|
| `nvidia/nemotron-3.5-super-vl:free` | best all-round, coding + vision, 1M ctx |
| `dots-studio/dots-3-note-preview:free` | fast coding, detailed explanations, 512K ctx |
| `recursive/flint-v1.0:free` | fastest (~6 s), light reasoning, 256K ctx |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | deepest reasoning, slower (~85 s), 1M ctx |
| `nvidia/nemotron-3.5-lightning:free` | quick thinking, 1M ctx |
| `xingchen-agi/xing4.0-29b-a4b:free` | solid backup coder, 256K ctx |

Excluded: `poolside/laguna-*` and `cohere/north-mini-code` burn the whole budget
on reasoning and never answer; `gemma-4-*` was in permanent 429; `inkling*`
returned 403; `nemotron-3-super-120b` was 404.

### Quota, measured not guessed

Google exposes **no** “remaining quota” endpoint — successful responses carry no
rate-limit headers (verified with `curl`). The limit only appears inside a 429:

```
limit: 20, model: gemini-2.5-flash. Please retry in 30m48s.
```

So AmitAI counts its own requests per model per day, and when a 429 does arrive it
learns the limit and reset time and shows them in the model picker.

---

## 13. Storage and privacy

| Key / file | Contents |
|---|---|
| SharedPreferences `amitai:*` | settings, conversations, quota, usage |
| AsyncStorage | mirror of the same JSON (survives prefs loss) |
| `/sdcard/AmitAI/*.json` | optional large-history store |

Settings are merged over `DEFAULT_SETTINGS` on load, so a field added in a later
version never comes back `undefined` for an existing install. Past ~1.5 MB the
oldest messages are stubbed (kept in the list, last 2 messages retained) so a
write never throws.

**Privacy in plain words**

- Your API key lives in app-private storage, readable only by this app's UID.
- It is sent **only** in the `Authorization` header to the base URL you chose.
- There is no AmitAI backend, no analytics SDK, no crash reporter, no ads.
- Web tools talk to DuckDuckGo and Open-Meteo — the same requests a browser makes.
- Wake-word audio is fed to Vosk and dropped; nothing is recorded or uploaded.
- Uninstalling removes everything the app stored.

---

## 14. Permissions, honestly explained

| Permission | Why | When asked |
|---|---|---|
| `INTERNET` | call your model endpoint, search, weather | install |
| `RECORD_AUDIO` | voice input and wake word | first mic tap / enabling wake word |
| `POST_NOTIFICATIONS` | the “Ok Amit is listening” card | Android 13+, on enabling |
| `FOREGROUND_SERVICE` + `…_MICROPHONE` | keep the listener alive | enabling wake word |
| `SYSTEM_ALERT_WINDOW` | floating bubble | only if you turn the bubble on |
| `RECEIVE_BOOT_COMPLETED` | restore the listener after reboot | install |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | stop OEMs killing the listener | button in settings |
| `WAKE_LOCK` | keep the listener alive while the screen is off | install |
| `MANAGE_EXTERNAL_STORAGE` | write chats to visible `/sdcard/AmitAI` | optional button |
| `READ/WRITE_EXTERNAL_STORAGE` | legacy Android only (`maxSdkVersion` 32/29) | install |

Nothing is requested at launch that isn't needed to show a chat screen.

---

## 15. Release history

| Version | Code | Size | Highlights |
|---|---|---|---|
| 3.6 | 9 | 101 MB | storage modes, chat-files panel, latest tool set |
| 3.5 | 8 | 101 MB | weekly usage dashboard, quota hints |
| 3.4 | 7 | 101 MB | barge-in, echo guard, voice-loop reliability |
| 3.3 | 6 | 101 MB | offline “Ok Amit” wake word, floating bubble, boot restore |
| 3.2 | 6 | 66 MB | weather, calculator and time tools |
| 3.1 | 4 | 65 MB | first build: streaming, markdown, vision, voice, web search |

> Note: `AmitAI-3.2.apk` reports `versionName 3.3` in its manifest (the version
> bump landed before that build). It is the build from before the wake word and
> carries `versionCode 6`, same as 3.3, so **install 3.6** unless you are
> reproducing history. Checksums for every file are in
> [`releases/README.md`](releases/README.md).

The APK grew from 65 MB to 101 MB in 3.3 because Vosk ships native recognition
libraries for **all four ABIs** (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`).
An arm64-only build would be roughly 25–30 MB smaller.

---

## 16. Known limits and roadmap

| Limit | Why | Path forward |
|---|---|---|
| Wake word needs a 40 MB download | Vosk model is not bundled | ship a quantized/keyword-only model |
| APK is 101 MB | 4 ABIs of `libvosk.so` | ABI splits + App Bundle |
| No syntax highlighting | avoided a heavy highlighter | add a tokenizer or Prism port |
| STT needs Google speech service | `SpeechRecognizer` backend | bundle Whisper via ONNX |
| No image generation | not in chat completions | call `/images/generations` |
| One image per message | UI simplicity | extend `toWire` to loop parts |
| Free models change often | OpenRouter catalogue moves | refresh `OPENROUTER_FREE` |
| Debug keystore | effortless side-loading | ship a real keystore |
| No iOS build | Android-native bridges (Vosk, overlay) | port with platform modules |

---

## 17. Why this is not a ChatGPT clone

The project started with a full static analysis of the official ChatGPT APK
(`com.openai.chatgpt` 1.2026.286 — manifest, dex strings, 1,996 assets, 85
shipped modules). The conclusion: a “same version” rebuild is not a build
problem, it is a physics problem.

| Barrier | Detail |
|---|---|
| `oai_device_integrity` | the app attests with Play Integrity + its signing cert; a resigned build gets 403 |
| `dil_*` + `cel` | the UI is **server-driven**: half the screens are not in the APK |
| Ownership | 70.7 MB of DEX and every asset is OpenAI's copyrighted work |

So AmitAI takes the **feature surface** from that analysis and implements it as
original code against the official API. Same result in your hand — streaming
answers, markdown, code, images, voice, memory of past chats — different, and
working, underneath. No OpenAI code, assets or trademarks are used.

**Deliberately absent** (present in their module list): wallet, finance,
multiplayer, subscriptions, family, health records. Those need OpenAI's backend
and a business entity, not code.

---

## 18. Credits

| Component | Author | Licence |
|---|---|---|
| React Native, React | Meta | MIT |
| Vosk / vosk-android | Alpha Cephei | Apache-2.0 |
| JNA | Java Native Access | Apache-2.0 / LGPL |
| Ionicons | Ionic | MIT |
| DuckDuckGo HTML endpoint | DuckDuckGo | unofficial, rate-limited |
| Open-Meteo | Open-Meteo | CC-BY-4.0 |
| ElevenLabs API | ElevenLabs | free tier, per-key quota |

Built and tested on a real **iQOO I2305** (Android 16, API 36, arm64-v8a),
with the laptop (Linux Mint, kernel 6.8) as the Ollama and bridge host.

<div align="center">

**If AmitAI is useful to you, star the repo — and read the code, it is all here.**

</div>
