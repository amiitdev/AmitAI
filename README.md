<div align="center">

<img src="assets/icon.jpg" width="120" alt="AmitAI icon" />

# AmitAI

### Your own AI assistant — your code, your key, your phone.

A native Android AI assistant built with **React Native + Kotlin**.
Streaming chat, thirteen on-device tools, long-term memory, multi-image vision,
scheduled jobs that answer while the app is closed (cron in plain words),
hands-free voice with **free on-device neural voices** (Piper + Kitten — no key,
no quota), an offline “Ok Amit” wake word, a floating bubble, and an **MCP server** so the opencode agent on the same phone can call AmitAI's own
memory, chat search, weather and clock — with **no telemetry, no account, no middleman**.

[![Download](https://img.shields.io/badge/⬇_Download-APK-6366f1?style=for-the-badge)](https://github.com/amiitdev/AmitAI/releases/latest)
[![Platform](https://img.shields.io/badge/Android-7.0%2B-3ddc84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/amiitdev/AmitAI/releases/latest)
[![React Native](https://img.shields.io/badge/React_Native-0.88-61dafb?style=for-the-badge&logo=react&logoColor=061a23)](https://reactnative.dev)
[![Kotlin](https://img.shields.io/badge/Kotlin-2.2-7f52ff?style=for-the-badge&logo=kotlin&logoColor=white)](https://kotlinlang.org)

![Version](https://img.shields.io/badge/version-4.0-6366f1?style=flat-square)
![Tests](https://img.shields.io/badge/tests-87_passed-10b981?style=flat-square)
![Voices](https://img.shields.io/badge/offline_voices-2-10b981?style=flat-square)
![TypeScript](https://img.shields.io/badge/tsc-0_errors-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Tools](https://img.shields.io/badge/on--device_tools-13-a855f7?style=flat-square)
![MCP](https://img.shields.io/badge/MCP_tools-5-f59e0b?style=flat-square)

</div>

---

## ⬇ Download

The newest build is **4.0** (`versionCode 13`). Every APK ever shipped is on the
[**Releases page**](https://github.com/amiitdev/AmitAI/releases).

| Version | What changed | Size | Link |
|---|---|---|---|
| **4.0** | **Offline neural voices** — Piper + KittenTTS run inside the app via sherpa-onnx (no key, no quota), audio-synced transcript with karaoke highlight, Jarvis-style voice HUD, STT survives `ERROR_CLIENT`, 87 tests | 223 MB | [AmitAI-4.0.apk](https://github.com/amiitdev/AmitAI/releases/download/v4.0/AmitAI-4.0.apk) |
| 3.9 | **opencode MCP server** — the CLI agent on your phone can call AmitAI's memory, chat search, weather and clock; foreground service keeps it alive in the background | 101 MB | [AmitAI-3.9.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.9/AmitAI-3.9.apk) |
| 3.8 | memory + past-chat recall that works even on tool-less providers | 101 MB | [AmitAI-3.8.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.8/AmitAI-3.8.apk) |
| 3.7 | Share into AmitAI, clipboard + memory tools, 8 images, scheduled jobs | 101 MB | [AmitAI-3.7.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.7/AmitAI-3.7.apk) |
| 3.6 | Storage modes, chat files, latest tools | 101 MB | [AmitAI-3.6.apk](https://github.com/amiitdev/AmitAI/releases/download/v3.6/AmitAI-3.6.apk) |
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
8. [Share, clipboard, memory, schedules and MCP](#8-share-clipboard-memory-schedules-and-the-opencode-mcp-server)
9. [File map](#9-file-map)
10. [Build from source](#10-build-from-source)
11. [Checks and real output](#11-checks-and-real-output)
12. [Settings reference](#12-settings-reference)
13. [Providers and free models](#13-providers-and-free-models)
14. [Storage and privacy](#14-storage-and-privacy)
15. [Permissions, honestly explained](#15-permissions-honestly-explained)
16. [Release history](#16-release-history)
17. [Known limits and roadmap](#17-known-limits-and-roadmap)
18. [Why this is not a ChatGPT clone](#18-why-this-is-not-a-chatgpt-clone)
19. [Credits](#19-credits)
20. [Everything AmitAI can do — with examples](#20-everything-amitai-can-do--with-examples)

---

## 1. What this is

AmitAI is a **complete, working AI assistant app** that runs entirely on the phone.
There is no AmitAI server: the app talks straight from your device to whichever model
endpoint you choose, and every tool (search, page reader, weather, calculator,
clock, clipboard, memory, scheduler) runs locally.

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
          ├── Android clipboard (only when asked)
          ├── notes + schedules (JSON on the phone)
          ├── Vosk 40 MB model  (offline wake word)
          └── MCP :8140         (opencode agent calls these tools)

   Share sheet ──▶ text / 8 images        AlarmManager ──▶ headless run ──▶ notification
```

**What makes it different from a chat wrapper**

| | Typical wrapper | AmitAI |
|---|---|---|
| Streaming | often fake or chunked-after-complete | real SSE parsed from `XMLHttpRequest.onprogress` |
| Tools | none, or a server you must host | 13 tools executing on-device |
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
| Edit-free resend | copy any reply, attach up to 8 images, send again |
| Multi-image vision | one message can carry 8 photos, all sent as parts |
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
| `read_clipboard` | Android `ClipboardManager` (focused-app read) | no |
| `remember` | local note store, survives restarts | no |
| `recall` | ranked search over those notes | no |
| `forget` | delete one note (asks when several match) | no |
| `create_schedule` | natural language → AlarmManager alarm | no |
| `list_schedules` | jobs + next run + last result | no |
| `delete_schedule` | cancel one job | no |
| `search_chats` | every saved conversation, ranked by keyword | no |

The model decides when to call them. Each tool can be switched off in
Settings → Tools, and there is a page budget (default 3) so a curious model cannot
burn your tokens reading 20 pages.

### 📎 Share, clipboard and memory

| Feature | Detail |
|---|---|
| **Share to AmitAI** | Android share sheet: text from Chrome, one image from Gallery, **or many images at once**. Text lands in the composer, images become attachments |
| **Process text** | select text in *any* app → ⋮ → **AmitAI** |
| **Clipboard read** | “summarise what I copied” works — the model calls `read_clipboard` instead of guessing |
| **Memory** | “remember my bike service is due in March” → saved on device; later “when is my bike service?” calls `recall` |
| **Auditable** | drawer → **Memory** shows every note with a delete button; nothing is hidden |
| **No cloud sync** | notes live in the same two local backends as chats |

```
   Chrome / Gallery / Files
            │  share intent (text, 1..N images)
            ▼
   ShareIntake.kt ── copies images to app cache ──▶ consumeShare() in JS
            │                                           │
            └── "AmitShared" event (if app already up) ─┘
                                                        ▼
                                              composer pre-filled
```

Memory is deliberately a plain list, not a vector database: `remember` writes a
sentence, `recall` does word-match ranking, and you can delete any row yourself.
A memory you cannot audit is a memory you cannot trust.

### ⏰ Scheduled jobs (cron in plain words)

Say what you want and when:

> “tell me the weather update every day at 8 am”
> “remind me every Monday at 9pm to plan the week”
> “check the news tomorrow at 7pm”

AmitAI turns that into a real alarm. At 8:00 the phone wakes a **Headless JS task**
even if the app was never opened, runs the *same* agent loop (tools included), and
posts the answer as a notification.

| Supported phrasing | Example |
|---|---|
| daily | `every day at 8 am` · `daily 07:30` · `every morning` |
| weekly | `every monday at 9pm` · `every friday at 18:00` |
| weekdays / weekends | `weekdays at 7:30` · `weekends at 10am` |
| interval | `every 2 hours` · `hourly` |
| one-off | `tomorrow at 7pm` · `today at 18:00` · `monday at 9am` |
| raw cron | `30 7 * * 1-5` (5 fields, lists, ranges, steps) |
| no time given | defaults to 09:00, and the confirmation says so |

**What makes it survive**

| Layer | What it does |
|---|---|
| `AmitSchedulerModule.kt` | `setExactAndAllowWhileIdle` (exact when allowed, else `setAndAllowWhileIdle`) |
| native copy of every job | SharedPreferences, so alarms can be rebuilt with **no JS running** |
| `ScheduleReceiver` | advances the next repetition *before* starting JS — a dead runtime cannot break the chain |
| `BootReceiver` | rebuilds the whole alarm set after a reboot or app update |
| app start | recomputes every next run from storage and re-pushes the alarms (self-healing after a timezone change) |
| imminent-run guard | an alarm due within two minutes is never cancelled by an app launch, so opening the app at 08:00 cannot skip that morning |
| `ScheduleTaskService` | `HeadlessJsTaskService`, 5-minute budget |
| notification | the finished answer, big-text style, tap → app |
| drawer → **Schedules** | next run, pause, delete, and the last result — jobs are never invisible |

> **Honest constraints.** Exact delivery needs the *Alarms & reminders* toggle on
> Android 12+ (the app offers a one-tap shortcut); without it alarms may drift a
> few minutes. Doze can delay a job, and a job needs a working network at fire
> time. Scheduled answers go to the notification shade — they do not appear as
> new chat messages.

### 🔁 Memory and past chats without tool support

Not every OpenAI-compatible endpoint forwards `tools` — the phone-local **AmitAI
Bridge** drops them entirely (its proxy never reads the field). So these are
handled on-device, with zero network:

| You type | What happens |
|---|---|
| “remember that …” | saved to notes and confirmed locally, even if the model saw no tools |
| “what do you know about me” | lists the note store locally |
| anything about an earlier chat | matching notes + chat excerpts are **prepended to the system prompt** before the model answers |

```
"do you remember my bike service?" ──▶ local search of notes + chats
                                             │
                                             ▼
       "Facts the user saved in memory: … December"
                                             │
                                             ▼
                       model: "Your bike service is in December."
```

Tool-capable providers also get the `search_chats` tool. The history preamble is
switched off with Settings → Tools → **Chat history search**.

### 🔌 opencode MCP server (new in 3.9)

A second AI lives on the same phone: the **opencode CLI** in Termux. It cannot use
AmitAI's tools directly — its API takes text, not tool definitions — so AmitAI
publishes its tools the way opencode *does* understand them: an **MCP server on
loopback**.

| Piece | Detail |
|---|---|
| Endpoint | `http://127.0.0.1:8140/mcp` — loopback only, nothing on your Wi-Fi can reach it |
| Auth | random `Bearer` token generated once, shown in Settings |
| Tools exposed | `remember` · `recall` · `search_chats` · `get_weather` · `get_time` |
| Transport | plain JSON-RPC over HTTP (`initialize`, `tools/list`, `tools/call`) |
| Kept alive by | a **foreground service** (`specialUse`) — otherwise Android freezes the app and every agent call times out |
| Setup | Settings → **opencode MCP** → *Copy opencode.json snippet* → paste under `"mcp"` → restart opencode |

```
  opencode (Termux)                    AmitAI
 ┌──────────────┐  1 tools/list      ┌────────────────────┐
 │ the brain    │ ─────────────────▶ │  note store        │
 │ (any model)  │  2 menu of 5 tools │  chat history      │
 │              │ ◀───────────────── │  weather / clock   │
 │              │  3 tools/call      │                    │
 │              │ ─────────────────▶ │  writes the note   │
 │              │  4 result          │  (shared prefs)    │
 └──────────────┘ ◀───────────────── └────────────────────┘
        loopback :8140 · Bearer token · app can stay backgrounded
```

The brain stays opencode's; AmitAI supplies only the facts and the writes. Ask the
agent *“remember my bike service is in December”* and the note appears in the
app's Memory tab. Next session, *“when is my bike service?”* calls `recall` and
the agent answers **December** — across sessions, which plain opencode cannot do.

### 🎙 Voice

| Feature | Detail |
|---|---|
| Voice input | Android `SpeechRecognizer` with partial results (words appear while you talk) |
| Read aloud — Device | Android `TextToSpeech` — instant, offline, 0.5×–2.0× |
| Read aloud — **Piper** | neural `vits-piper en_US-lessac-low-int8` (21 MB), on-device |
| Read aloud — **Kitten** | neural `kitten-nano v0.2 fp16`, 8 voices (Bella · Jasper · Luna · Bruno · Rosie · Hugo · Kiki · Leo) |
| Synced transcript | words highlight and scroll in step with the audio |
| No key, no quota | synthesis never leaves the phone |
| Voice mode | hands-free listen → think → speak → listen loop |
| **Stop anytime** | tap the orb or hang-up; the mic is closed during playback so MIUI cannot cut the answer |
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
   · schedules
   · memory
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
        │                                            │ lib/memory       │
        │                                            │ lib/schedules    │
        │                                            └──────┬──────────┘
        │                                                   │ bridge
        │            ┌──────────────────────────────────────▼─────────┐
        │            │           Kotlin native layer                    │
        └───────────▶│ AmitVoiceModule   STT · TTS · clips · storage    │
                     │ AmitAssistant     wake · bubble · policy · share │
                     │ AmitScheduler     alarms · notify · exact perms  │
                     │ WakeWordService   Vosk · foreground · wakelock   │
                     │ BubbleService     overlay window                 │
                     │ ScheduleReceiver  fires → headless JS task       │
                     │ BootReceiver      restores wake + alarms         │
                     │ ShareIntake       copies shared images to cache  │
                     │ MicGate           one mic, in-app wins           │
                     └──────────────────────────────────────────────────┘
```

The headless path is a second entry point into the same JS:

```
 AlarmManager ─▶ ScheduleReceiver ─▶ ScheduleTaskService ─▶ index.js
                                                            │
                                            registerHeadlessTask('AmitScheduleTask')
                                                            ▼
                                        schedules.ts → runAgent() → notify()
```

That is the whole trick behind “every day at 8 am”: no server, no push service,
no polling — just an alarm that wakes the app's own JS for one request.

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

### Three engines, all free

| | Device | Piper | Kitten |
|---|---|---|---|
| Engine | Android `TextToSpeech` | sherpa-onnx VITS | sherpa-onnx KittenTTS |
| Model | system | `vits-piper-en_US-lessac-low-int8`, 21 MB | `kitten-nano-en-v0_2-fp16`, 30 MB |
| Voices | system | 1 (Lessac) | 8 (Bella, Jasper, Luna, Bruno, Rosie, Hugo, Kiki, Leo) |
| Latency | instant | ~1–2 s for a paragraph | ~1–2 s |
| Quality | robotic | clear | warmer, more natural |
| Cost / network | free / none | free / none | free / none |

There is no cloud or paid voice any more. **Device** is the zero-setup system
voice; choosing **Piper** or **Kitten** in Settings routes synthesis through
sherpa-onnx on the phone.

### How a reply becomes audio

```
text ──▶ LocalTts.speak(engine, voice, speed)
          ├─ first run: assets/tts/<engine> ─▶ filesDir/tts/<engine>
          │             (marker `localtts.v2.<engine>` ⇒ unpack happens once)
          ├─ OfflineTts.generate(text, sid, speed) ─▶ float samples
          └─ 16-bit mono WAV ─▶ cacheDir/amit-tts.wav
                                   │
                   MediaPlayer ◀───┘   (Kotlin; the JS bridge is not in the path)
                                   │
                  progress ticker every 150 ms
                                   ▼
             AmitVoiceProgress { id, position, duration } ──▶ JS
                                   ▼
             TranscriptCard: word highlight + proportional auto-scroll
```

The player lives in Kotlin because a 40-second paragraph must survive JS being
busy, backgrounded, or reloaded.

### The transcript follows the voice

The word index is `floor(position / duration × wordCount)`, applied across
per-line blocks, so numbered answers keep their own paragraphs and the highlight
advances exactly as the audio reaches each word. When a ROM reports no duration
(the Device voice can do this), a timer estimate takes over.

### Barge-in is off by design (4.0)

Through 3.9 the mic stayed open while the answer played. On MIUI the loudspeaker
bled into the recognizer, which interrupted the very sentence it was hearing —
playback died ~450 ms in and the loop retriggered. 4.0 closes the mic during
playback (`BARGE_IN = false`); tap the orb or hang-up to stop. The echo-overlap
guard and stop words in `barge.ts` remain for engines that support live barge-in.

### Pinned versions, and the errors they prevent

| Component | Pinned | Why |
|---|---|---|
| sherpa-onnx | **v1.12.40** | `Tts.kt` is copied from this exact tag; mixing tags throws `NoSuchFieldError: no "Ljava/lang/String;" field "lexicon"` |
| Piper voice | `en_US-lessac-low-int8` | smallest model that still sounds clean through a phone speaker |
| Kitten | **v0.2 fp16** | v0.8 ships a 400-wide style tensor, rejected as `style_dim[0] should be 1, given: 400` |

Neither the `.so` files nor the models are committed — `./scripts/fetch-tts.sh`
downloads them (73 MB of libs for `arm64-v8a` + `x86_64`, 78 MB of models).

### What replaced ElevenLabs, step by step

Fourteen changes, 21 files, +1635 / −373 lines. Nothing about the cloud path
survived.

| # | Step | What changed |
|---|---|---|
| 1 | Dropped the cloud engine | `AmitVoiceModule` lost the ElevenLabs branch (`eleven_flash_v2_5`, `xi-api-key`, MP3 fetch, cloud speaker). No key field, no voice list, no metering. |
| 2 | Picked a runtime | sherpa-onnx, because it ships VITS (Piper) **and** KittenTTS behind one C++ core, offline, Apache-2.0. |
| 3 | Vendored the natives | sherpa-onnx `v1.12.40` `.so` for `arm64-v8a` + `x86_64` into `jniLibs/` (73 MB). The Kotlin API `Tts.kt` is copied from the same tag — the JNI surface is version-specific. |
| 4 | Bundled the voices | `vits-piper-en_US-lessac-low-int8` (21 MB) and `kitten-nano-en-v0_2-fp16` (30 MB, 8 speakers) in `assets/tts/`. |
| 5 | Wrote the engine wrapper | `LocalTts.kt`: unpack assets to `filesDir` once (marker `localtts.v2.*`), build the right config per engine, synthesise to 16-bit mono WAV in `cacheDir`. |
| 6 | Rewired the bridge | `speakLocal(text, engine, voice, speed, utteranceId)` + `stopLocal()` + `playFile()` on `MediaPlayer`; `stopCloud()` and the HTTP path deleted. |
| 7 | Replaced the JS contract | `types.ts` `ttsProvider: 'device' / 'piper' / 'kitten'`; `native.ts` `speakLocal`/`stopLocal`; `speech.ts` routes per engine, waits up to 30 s for the first audio frame, and turns sherpa failures into “The offline voice could not run on this phone”. |
| 8 | Rebuilt the settings UI | Three voice chips, the eight Kitten speakers, “Test this voice”. The ElevenLabs key/voice/plan rows are gone. |
| 9 | Added playback progress | A 150 ms Kotlin ticker emits `AmitVoiceProgress { id, position, duration }`; the old cloud path had no position at all. |
| 10 | Rebuilt voice mode around it | Audio-synced transcript card with karaoke highlight, Jarvis HUD (radar while thinking, bars while speaking), hint only while listening. |
| 11 | Made the mic survive | STT retries `ERROR_CLIENT`/`ERROR_AUDIO` up to eight times with backoff — the old “Speech error 5” toast is gone. |
| 12 | Closed the mic during playback | `BARGE_IN = false`: on MIUI the speaker bled into the recogniser and killed playback ~450 ms in. |
| 13 | Fixed the text | `plainMarkdown` keeps numbered items and table rows on their own lines (a five-item answer used to collapse into one block); `Markdown.tsx` handles `***bold italic***` and `**a*b**`. |
| 14 | Kept the repo shippable | Binaries and models are gitignored and fetched by `scripts/fetch-tts.sh`; versions pinned; tests 82 → 87; this README rewritten. |

Pushing two `.so` sets and 78 MB of models into the APK costs ~151 MB of install
size. That is the price of “works on a plane, with no key, on a metered plan”.

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

## 8. Share, clipboard, memory, schedules and the opencode MCP server

Four features that all share one rule: **they run on the phone, and you can see
everything they store.**

### 8.1 Share to AmitAI

```
Gallery ─┐
Chrome  ─┼─ ACTION_SEND / SEND_MULTIPLE ─▶ MainActivity
Files   ─┘                                     │
                                               ▼
                            ShareIntake.kt (object, process memory)
                                 │ text = EXTRA_TEXT / PROCESS_TEXT
                                 │ images = clipData / EXTRA_STREAM
                                 │ copy each image → cache/share/*.jpg
                                 ▼
              cold start ── consumeShare() when App mounts
              warm start ── "AmitShared" event → consumeShare()
                                 ▼
                        composer: text + up to 8 thumbs
```

The manifest declares four filters (plain text, one image, many images,
`PROCESS_TEXT`), so AmitAI appears in the normal Android share sheet and in the
text-selection menu.

Two details that matter:

- **Images are copied, not linked.** A `content://` URI from another app only
  lives as long as that app's grant. Copying to `cache/share/` means the photo is
  still readable when you finally press send, even if Chrome was killed in
  between. Files older than a day are swept on the next share.
- **The payload is pulled, not pushed.** The event carries no data, just a nudge;
  JS calls `consumeShare()` once, so a share that arrives before React mounts
  cannot be lost or applied twice.

### 8.2 Clipboard

`AmitVoiceModule.getClipboard()` reads `ClipboardManager.primaryClip` and returns
text. JS exposes it as the `read_clipboard` tool (Settings → Tools can disable
it). Two platform rules are documented rather than fought:

- Android 10+ only lets the **focused** app read the clipboard, so this works
  when you are actually in AmitAI (a scheduled job cannot read it).
- Some OEMs show a “AmitAI pasted from…” toast. That is the OS, not telemetry.

The tool returns the clipboard verbatim (up to 8,000 chars) and says
`The clipboard is empty.` instead of inventing content when there is none.

### 8.3 Memory

```
src/lib/memory.ts
  Note { id, text, createdAt, updatedAt }
  addNote()   dedupes case/punctuation-insensitively ("Wi-Fi" == "wifi")
  recall()    word-overlap score, recency breaks ties
  forget()    deletes only when exactly one note matches
  cap         500 notes (oldest falls off)
```

Stored as one JSON array under `amitai:memory:v1` in SharedPreferences **and**
AsyncStorage, exactly like settings and chats. The screen at drawer → **Memory**
is a plain list: add, delete one, clear all. There is no background sync and no
embedding service.

Why so simple? Because “AI memory” is usually a black box. Here the model can only
remember what it wrote down, and you can read the whole thing in ten seconds.

### 8.4 Schedules: from a sentence to an alarm

```
 "tell me the weather every day at 8 am"
              │
              ▼
   model calls create_schedule(title, prompt, when)
              │
              ▼
   parseWhen("every day at 8 am")        ← src/lib/schedules.ts, pure JS
     repeat=daily, hour=8, minute=0
              │
              ▼
   nextRun() → 2026-10-26T08:00 local    (DST-correct wall clock)
              │
              ├─ stored: amitai:schedules:v1 (prefs + AsyncStorage)
              └─ applySchedules() → AmitScheduler.replaceAll(json)
                                        │
                                        ▼
                         AlarmManager.setExactAndAllowWhileIdle
                                        │
                        ┌───────────────┴────────────────┐
                        │ 07:59:59.9 — alarm fires       │
                        ▼                                │
              ScheduleReceiver                          │
               1. advance + save the next occurrence     │  ← survives a dead JS
               2. startService(ScheduleTaskService)      │
                        │                                │
                        ▼                                │
           HeadlessJsTaskService → AppRegistry            │
             .registerHeadlessTask('AmitScheduleTask')    │
                        │                                │
                        ▼                                │
           runAgent(stream:false, tools, maxRounds:3)     │
                        │                                │
                        ├── markScheduleRun() ────────────┘  (re-arm precisely)
                        └── notify(title, answer)
```

**Why the date maths lives in JS.** Weekdays, cron fields and “8 am” are wall-clock
concepts; doing them natively would mean a second implementation that can drift
from what the UI shows. Kotlin is only told “fire at this epoch ms”, and keeps a
`repeatMs` fallback so a repeating job still advances if JS never starts.

**The cron parser** (`parseCron` + `nextCron`) supports the standard five fields
with `*`, `n`, `a-b`, `*/n` and comma lists, and ORs day-of-month with
day-of-week when both are restricted — the same rule Vixie cron uses. It walks by
**day** rather than by minute, so a rare expression stays fast:

```js
// every weekday at 07:30
nextCron('30 7 * * 1-5', Date.now());   // → next Monday 07:30 local
```

**Failure policy** is explicit: a run that fails still records `lastError`, still
posts a notification (“The job failed: …”), and still re-arms the next
occurrence. A schedule that quietly dies after one bad request would be worse
than no schedule at all.

**What the user sees** in drawer → **Schedules**:

```
┌──────────────────────────────────────────────────────┐
│ Schedules                                            │
│ run with the app closed · answers arrive as notifs   │
├──────────────────────────────────────────────────────┤
│ Morning weather                    ⏸      🗑         │
│ every day at 08:00 · next tomorrow, 08:00 (in 9 h)   │
│ “today's weather in Nagpur in 3 lines”               │
│ ── Nagpur: 27°C, 40% rain chance, light cotton…      │
└──────────────────────────────────────────────────────┘
```

Between the alarm and the notification there are three things that can go wrong
on real Android hardware, and each has a visible answer: no notification
permission (asked when you create the first job), no exact-alarm permission
(banner on the Schedules screen), and battery optimisation (the existing
wake-word toggle already links to it).

### 8.5 Chat history recall

The complaint that started this: *“my chats are saved on the SD card, but a new
chat forgets them.”* Root cause was the provider, not storage — the bridge drops
`tools`, so a `recall` tool could never fire.

The fix has two halves:

| Half | Where | Works with |
|---|---|---|
| `search_chats` tool | `agentTools.ts` → `history.ts` | providers that support tool calls |
| recall preamble | `history.ts` → every request | **any** provider, tool-less included |

The preamble is deliberately boring and local:

```ts
const [hits, notes] = await Promise.all([
  searchHistory(query, { excludeConversationId: activeId, limit: 4, maxPerChat: 1 }),
  searchNotes(query, 5),
]);
// notes first, then dated chat excerpts, prepended to the system prompt
```

Ranking is keyword overlap (length-weighted, long messages damped), stop words
removed, the current conversation excluded so the question cannot retrieve
itself. Notes win over chat lines because a note is a fact the user asked to keep.

Verified on the phone (I2305, 3.8, provider = AmitAI Bridge / tool-less):

```
you (new chat):  when is my bike service due
AMITAI:          Your bike service is in December.
```

Before 3.8 the same device answered *“I don't have memory of past chats”*.

**Limits, stated plainly:** keyword matching, not embeddings — synonyms
(“two-wheeler” vs “bike”) will miss. Only the top 4 excerpts are injected, 320
chars each, to keep the prompt small. Audio/image-only messages are ignored.

### 8.6 The opencode tool server (MCP)

#### Why it exists

The AmitAI Bridge forwards one text prompt to opencode and streams the answer
back. What it *cannot* do is hand over tools: opencode's message API accepts
text/parts, not a `tools` array. So the bridge can never say “here are the app's
thirteen tools”.

But opencode **does** have an extension point — MCP servers — and it will happily
connect to one over HTTP. So the direction is inverted: instead of pushing tools
into opencode, AmitAI **serves** them, and the agent pulls.

| Question | Answer |
|---|---|
| Can the bridge give AmitAI's tools to opencode? | **No** — the API has no field for it |
| Can opencode use tools at all? | **Yes** — its own file/bash tools, and any **MCP server** in `opencode.json` |
| So how do the app's tools reach it? | the app *is* the MCP server: `http://127.0.0.1:8140/mcp` |
| Why not just let the bridge do it? | clipboard, alarms and notes live inside the app process — only the app can execute them |

#### The protocol, in three messages

MCP over HTTP here is just JSON-RPC with a token. Verified on the phone:

```bash
# 1 — handshake
POST /mcp  {"jsonrpc":"2.0","id":1,"method":"initialize"}
→ {"result":{"protocolVersion":"2024-11-05",
             "capabilities":{"tools":{}},
             "serverInfo":{"name":"amitai-tools","version":"1.0.0"}}}

# 2 — what can you do?
POST /mcp  {"jsonrpc":"2.0","id":1,"method":"tools/list"}
→ {"result":{"tools":[
     {"name":"remember",     "description":"Save a durable note on the user's phone …"},
     {"name":"recall",       "description":"Search notes saved on this phone …"},
     {"name":"search_chats", "description":"Search the user's earlier AmitAI conversations …"},
     {"name":"get_weather",  "description":"Current weather for a city (Open-Meteo, no key) …"},
     {"name":"get_time",     "description":"Current date and time …"}]}}

# 3 — do it
POST /mcp  {"jsonrpc":"2.0","id":9,"method":"tools/call",
            "params":{"name":"remember","arguments":{"text":"bike service is in December"}}}
→ {"result":{"content":[{"type":"text",
      "text":"Saved to memory: bike service is in December"}]}}
```

Real answers from the device, one line each:

```
remember      Saved to memory: MCP check: written from the opencode agent, not the app UI
recall        - MCP check: written from the opencode agent, not the app UI
              - MCP test: notes can be written by the opencode agent
get_time      Mon, 26 Oct 2026 13:17 (GMT+05:30)
get_weather   Nagpur, India: 32.5°C (feels 33.3°C), humidity 31%, wind 10.2 km/h, code 0.
search_chats  No earlier conversation matched "bike service".
```

The `remember` call is the interesting one: it wrote into the app's own note
store, and the note then appeared in **drawer → Memory** at `10/26/2026, 1:17:52 PM`
with a delete button — written by the agent, never typed by the user.

#### The foreground service (why 3.9 needed it)

The first implementation started the server from `MainApplication`. It worked
perfectly while the app was open and failed in the only situation that matters —
when the user is inside opencode, so AmitAI is *not* the app on screen:

```
   app in foreground   → 200 in 22 ms
   app backgrounded    → port still LISTEN, every call http_code=000 after 15 s
```

Android freezes a backgrounded app to save battery. The listening socket survives
(the kernel keeps it), but no thread runs to `accept()` — so the client connects
and then waits forever. A **foreground service** exempts the process from that
freezer, which is exactly what a tool server needs.

| Piece | Detail |
|---|---|
| `McpService.kt` | foreground service, `foregroundServiceType="specialUse"`, `START_STICKY` |
| Notification | low importance, “AmitAI tools ready”, ongoing, with a **Stop** action |
| Permission | `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE` |
| Toggle | Settings → opencode MCP → **Keep running in background** (default **on**) |
| After a reboot | `BootReceiver` restarts it when the toggle was on |
| Upgrade race | if the old process still holds `:8140` after an update, the server retries the bind 5× over ~7 s instead of dying silently |
| Cost | one notification + an idle loopback socket; no wake lock |

Measured on the iQOO I2305 after the fix:

```
home + 25 s             → http=200  time=0.022 s
screen off + 60 s       → {"result": … "Mon, 26 Oct 2026 13:40 (GMT+05:30)"}
after reinstall + 20 s  → http=200  time=0.011 s
screen off + 180 s      → all five tools answered (remember / recall /
                          get_time / get_weather / search_chats)
```

For comparison, the same call before the service existed:

```
app backgrounded → http_code=000 after 15 s (socket open, nobody reading)
```

#### Setup, end to end

1. Open AmitAI → ☰ → **Settings** → scroll to **opencode MCP**.
2. Confirm it says *listening · background service on* (and switch the toggle on if not).
3. Tap **Copy opencode.json snippet**. It copies exactly this, with your token:

   ```json
   {
     "mcp": {
       "amitai": {
         "type": "remote",
         "url": "http://127.0.0.1:8140/mcp",
         "enabled": true,
         "headers": { "Authorization": "Bearer <your token>" }
       }
     }
   }
   ```

4. In Termux, paste it **inside** the existing `"mcp"` object of
   `~/.config/opencode/opencode.json` (alongside `gmail`, `composio`, `yt-notes`).
5. Restart opencode. Ask *“use the AmitAI tools to check the weather in Nagpur”* —
   the tool should appear in the transcript as `amitai_get_weather`.

#### Limits, stated plainly

- **Loopback only.** `127.0.0.1` — your laptop and other devices cannot call it. That is deliberate: the token protects against other apps on the phone, not against the network.
- **Only five tools.** Notes, chat search, weather, clock. Clipboard, schedules and the UI are *not* exposed — they need app-side intent and user presence.
- **The app must be installed and the service on.** Kill it in Settings → Apps, and the endpoint disappears.
- **The brain is still opencode's model.** MCP gives it facts, not intelligence; a quota-limited free model stays quota-limited.
- **Nothing is written to disk by MCP itself.** `remember` appends to the same note store the Memory screen shows, so you can audit and delete it.

---

## 9. File map

```
AmitAI/
├── App.tsx                         root: state, streaming, drawer, header
├── index.js                        registers <App/>
├── assets/                         icon + splash art
├── releases/                       APK index + checksums (binaries live on Releases)
├── __tests__/                      12 suites, 87 tests
├── scripts/fetch-tts.sh            sherpa libs + Piper/Kitten models (~150 MB)
└── src/
    ├── types.ts                    Message, Conversation, Settings, providers,
    │                               PRESETS, PRICES, KITTEN_VOICES
    ├── theme.ts                    3 themes + tokens (space, radius, font)
    ├── api/
    │   ├── openai.ts               runAgent: SSE + tool loop, ping, image → data URL
    │   └── tools.ts                DDG search, HTML→text, weather, calc, time
    ├── storage/store.ts            AsyncStorage + prefs + external-file backend
    ├── lib/
    │   ├── native.ts               voice bridge, picker (1–8), clipboard, share,
    │   │                           scheduler + notification permission
    │   ├── assistant.ts            wake word / bubble / permissions bridge
    │   ├── agentTools.ts           tool schemas + executor + page budget
    │   ├── memory.ts               notes: add / search / delete, 500-row cap
    │   ├── memoryCommands.ts       “remember …” handled on-device, no model needed
    │   ├── history.ts              past-chat ranking + recall preamble
    │   ├── schedules.ts            parseWhen, cron parser, nextRun, native sync
    │   ├── scheduleTask.ts         headless runner: agent loop → notification
    │   ├── reader.ts               queue between tools and the hidden WebView
    │   ├── speech.ts               routes device/Piper/Kitten + progress stream
    │   ├── format.ts               plainMarkdown (lines kept) + spokenWordIndex
    │   ├── barge.ts                echo guard + stop words
    │   ├── quota.ts                per-model daily counters, 429 learning
    │   ├── usage.ts                weekly requests/tokens/cost
    │   └── useKeyboard.ts          edge-to-edge IME inset handling
    ├── components/
    │   ├── Bubble.tsx              user bubble (with images) vs markdown + actions
    │   ├── Composer.tsx            input, 8-image strip, mic, web toggle, send/stop
    │   ├── Markdown.tsx            dependency-free renderer (tables included)
    │   ├── VoiceHud.tsx            orb: tick ring, radar sweep, waveform bars
    │   ├── TranscriptCard.tsx      karaoke transcript, follows the audio
    │   ├── CodeBlock.tsx           syntax colour + per-block copy
    │   ├── ConversationList.tsx    search, new, pin, rename, delete + foot nav
    │   ├── Sheet.tsx               bottom sheet + rename dialog
    │   ├── Toast.tsx               toast provider
    │   ├── WebReader.tsx           hidden WebView for open_page
    │   ├── AssistantSection.tsx    wake word, bubble, listening policy
    │   ├── StorageSection.tsx      folder, free space, all-files grant
    │   └── SplashScreen.tsx        animated splash
    └── screens/
        ├── SettingsScreen.tsx      ~850 lines, every switch documented below
        ├── SchedulesScreen.tsx     jobs, next run, pause, delete, last answer
        ├── MemoryScreen.tsx        audit and delete what the model remembers
        └── VoiceMode.tsx           hands-free loop + barge-in

android/app/src/main/java/com/amit/ai/
├── MainActivity.kt / MainApplication.kt
├── AmitVoiceModule.kt              STT · TTS routing · progress events · clipboard
├── LocalTts.kt                     sherpa-onnx engines, asset unpack, WAV writer
├── com/k2fsa/sherpa/onnx/Tts.kt    sherpa Kotlin API (pinned to v1.12.40)
├── AmitVoicePackage.kt             registers all three modules
├── AmitAssistantModule.kt          wake · bubble · policy · model download · share
├── AmitSchedulerModule.kt          AlarmManager · channels · notifications
├── ScheduleReceiver.kt             alarm → advance repeat → headless task
├── ScheduleTaskService.kt          HeadlessJsTaskService ('AmitScheduleTask')
├── ShareIntake.kt                  share intents, image copy into cache
├── AssistantBus.kt / AssistantPrefs.kt
├── WakeWordService.kt              Vosk foreground listener
├── BubbleService.kt                draggable overlay
├── McpService.kt                   foreground service that owns the MCP socket
├── AmitMcpServer.kt                HTTP/JSON-RPC server on 127.0.0.1:8140
├── McpTools.kt                     the five tools the agent can call
├── BootReceiver.kt                 restore wake + MCP server + rebuild alarms
└── MicGate.kt                      mic arbitration
```

---

## 10. Build from source

### Prerequisites

| Need | Version |
|---|---|
| Node | ≥ 22.11 |
| JDK | 17+ |
| Android SDK | platform 37, build-tools 37 |
| Android NDK | 27.1.12297006 |
| Device / emulator | Android 7.0+ |
| Node on Gradle's PATH | ≥ 20 — Metro runs inside the Gradle daemon |

### Debug

```bash
git clone https://github.com/amiitdev/AmitAI.git
cd AmitAI
./scripts/fetch-tts.sh                    # sherpa libs + both voices, ~150 MB, once
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

### Offline voice assets

`scripts/fetch-tts.sh` is idempotent and needs `curl`, `tar`, `bzip2`, `rsync`:

```bash
./scripts/fetch-tts.sh
# have  jniLibs (arm64-v8a, x86_64)
# have  voice .../assets/tts/piper
# have  voice .../assets/tts/kitten
# offline voice stack ready
```

It installs sherpa-onnx `v1.12.40` natives into
`android/app/src/main/jniLibs/{arm64-v8a,x86_64}/` and the two voices into
`android/app/src/main/assets/tts/{piper,kitten}/`. Both paths are gitignored;
`android/app/build.gradle` limits packaging to those two ABIs.

### Troubleshooting the voice build

| Symptom | Cause | Fix |
|---|---|---|
| `NoSuchFieldError: ... "lexicon"` at first speak | `Tts.kt` and `libsherpa-onnx-jni.so` from different tags | re-run `fetch-tts.sh`; keep both at `v1.12.40` |
| `style_dim[0] should be 1, given: 400` | Kitten v0.8 model | use `kitten-nano-en-v0_2-fp16` |
| `configs.toReversed is not a function` during build | Metro under Node 18 from the Gradle daemon | `export PATH=~/.nvm/versions/node/v24.19.0/bin:$PATH && ./gradlew --stop` |
| Voice silent, logcat clean | first-run unpack still running | wait for `localtts.v2.*` marker; retry |
| Build fails on missing `.so` | clone without fetching binaries | run `scripts/fetch-tts.sh` |

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

## 11. Checks and real output

```bash
$ npx tsc --noEmit
$ echo $?
0
```

```bash
$ npx jest --silent
PASS __tests__/VoiceAndTheme.test.tsx
PASS __tests__/MultiImage.test.ts
PASS __tests__/SpeechState.test.tsx
PASS __tests__/MarkdownTable.test.tsx
PASS __tests__/Memory.test.ts
PASS __tests__/Schedule.test.ts
PASS __tests__/SettingsProviders.test.tsx
PASS __tests__/App.test.tsx
PASS __tests__/History.test.ts
PASS __tests__/MemoryCommands.test.ts
PASS __tests__/VoiceLoop.test.tsx

Test Suites: 11 passed, 11 total
Tests:       82 passed, 82 total
Snapshots:   0 total
Time:        7.08 s
```

```bash
$ npx eslint .
✖ 19 problems (0 errors, 19 warnings)
```

The 19 warnings are the project's existing inline-style/`no-void` style nits —
there are **no errors**.

What the suites cover:

| Suite | Locks down |
|---|---|
| `App.test.tsx` | the app renders and the shell mounts |
| `MarkdownTable.test.tsx` | table parsing and table rendering |
| `SettingsProviders.test.tsx` | per-provider key switching without losing others |
| `SpeechState.test.tsx` | TTS utterance ids, start/end/error events |
| `VoiceAndTheme.test.tsx` | barge-in echo guard, stop words, theme tokens |
| `VoiceLoop.test.tsx` | the listen → think → speak loop and its timers |
| `MultiImage.test.ts` | text + N image parts, the 8-image cap, old single-image messages |
| `Memory.test.ts` | dedupe across case/punctuation, ranked search (incl. “wifi” → “Wi-Fi”), update/delete, clear |
| `Schedule.test.ts` | every supported phrasing, cron maths, next-run rollover, storage round-trip |

`Schedule.test.ts` runs against a frozen clock (Sunday 25 Oct 2026, 06:30), so
“next Monday at 9pm” is an assertion, not a coin flip.

Build artefacts (APK 3.9):

```
$ apkanalyzer manifest print AmitAI-3.9.apk | head
package="com.amit.ai"
android:versionCode="12"
android:versionName="3.9"
android:minSdkVersion="24"
android:targetSdkVersion="36"

$ unzip -l AmitAI-3.9.apk | grep libvosk
8862928  lib/arm64-v8a/libvosk.so
8279808  lib/armeabi-v7a/libvosk.so
...

$ ls -lh AmitAI-3.9.apk
101M
```

---

## 12. Settings reference

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
| Tools | Clipboard | on | advertise `read_clipboard` |
| Tools | Memory (notes) | on | advertise `remember` / `recall` / `forget` |
| Tools | Scheduled jobs | on | advertise `create_schedule` / `list_schedules` / `delete_schedule` |
| Tools | Chat history search | on | advertise `search_chats` + inject the recall preamble |
| opencode MCP | Endpoint + token | generated | `http://127.0.0.1:8140/mcp` and its `Bearer` token |
| opencode MCP | Keep running in background | **on** | foreground service keeps the endpoint answering when the app is not on screen |
| opencode MCP | Copy opencode.json snippet | — | copies the `amitai` MCP block ready to paste |
| Web access | Page reader | Fast | Fast = fetch + strip · Browser = hidden WebView |
| Web access | Pages per answer | 3 | hard budget (1–6) |
| Voice | Speaking voice | Device | Device TTS · Piper · Kitten |
| Voice | Speaking speed | 1.0× | 0.5×–2.0× |
| Voice | Kitten voice | Bella | 8 on-device voices |
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

## 13. Providers and free models

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

## 14. Storage and privacy

| Key / file | Contents |
|---|---|
| SharedPreferences `amitai:*` | settings, conversations, quota, usage, memory, schedules |
| SharedPreferences `amitai_schedules` | the native alarm list (id, title, prompt, next fire, repeat) |
| AsyncStorage | mirror of the same JSON (survives prefs loss) |
| `/sdcard/AmitAI/*.json` | optional large-history store |
| `cache/share/*` | images shared into the app, swept after 24 h |

Settings are merged over `DEFAULT_SETTINGS` on load, so a field added in a later
version never comes back `undefined` for an existing install. Past ~1.5 MB the
oldest messages are stubbed (kept in the list, last 2 messages retained) so a
write never throws.

**Privacy in plain words**

- Your API key lives in app-private storage, readable only by this app's UID.
- It is sent **only** in the `Authorization` header to the base URL you chose.
- There is no AmitAI backend, no analytics SDK, no crash reporter, no ads.
- Web tools talk to DuckDuckGo and Open-Meteo — the same requests a browser makes.
- The clipboard is read **only** when the model calls `read_clipboard` during a
  reply you asked for; there is no background clipboard watcher.
- Memory is a plain JSON list you can read and delete in the app; it never syncs.
- Scheduled jobs send the same request to the same endpoint you configured, at the
  time you chose. Nothing about the schedule is uploaded.
- Wake-word audio is fed to Vosk and dropped; nothing is recorded or uploaded.
- Uninstalling removes everything the app stored (including alarms).

---

## 15. Permissions, honestly explained

| Permission | Why | When asked |
|---|---|---|
| `INTERNET` | call your model endpoint, search, weather | install |
| `RECORD_AUDIO` | voice input and wake word | first mic tap / enabling wake word |
| `POST_NOTIFICATIONS` | the “Ok Amit is listening” card and scheduled answers | Android 13+, on enabling / first job |
| `FOREGROUND_SERVICE` + `…_MICROPHONE` | keep the listener alive | enabling wake word |
| `FOREGROUND_SERVICE` + `…_SPECIAL_USE` | keep the MCP endpoint answering while the app is backgrounded | starts with the app (toggle in Settings) |
| `SYSTEM_ALERT_WINDOW` | floating bubble | only if you turn the bubble on |
| `RECEIVE_BOOT_COMPLETED` | restore the listener **and rebuild scheduled alarms** after reboot | install |
| `SCHEDULE_EXACT_ALARM` | fire a job at 08:00 and not 08:14 | Android 12+ toggle, opened from the Schedules banner |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | stop OEMs killing the listener | button in settings |
| `WAKE_LOCK` | keep the listener alive while the screen is off | install |
| `MANAGE_EXTERNAL_STORAGE` | write chats to visible `/sdcard/AmitAI` | optional button |
| `READ/WRITE_EXTERNAL_STORAGE` | legacy Android only (`maxSdkVersion` 32/29) | install |

Nothing is requested at launch that isn't needed to show a chat screen.

Two features deliberately need **no** permission: sharing into AmitAI (the intent
carries its own one-shot grant) and reading the clipboard (allowed for the app in
the foreground, and only when you ask a question that needs it).

---

## 16. Release history

| Version | Code | Size | Highlights |
|---|---|---|---|
| 3.9 | 12 | 101 MB | **opencode MCP server**: the CLI agent on the phone can call AmitAI's memory, chat search, weather and clock; foreground service keeps it answering in the background |
| 3.8 | 11 | 101 MB | memory + past-chat recall that works on tool-less providers |
| 3.7 | 10 | 101 MB | share into AmitAI, clipboard + memory tools, 8-image vision, scheduled jobs |
| 3.6 | 9 | 101 MB | storage modes, chat-files panel, latest tool set |
| 3.5 | 8 | 101 MB | weekly usage dashboard, quota hints |
| 3.4 | 7 | 101 MB | barge-in, echo guard, voice-loop reliability |
| 3.3 | 6 | 101 MB | offline “Ok Amit” wake word, floating bubble, boot restore |
| 3.2 | 6 | 66 MB | weather, calculator and time tools |
| 3.1 | 4 | 65 MB | first build: streaming, markdown, vision, voice, web search |

> Note: `AmitAI-3.2.apk` reports `versionName 3.3` in its manifest (the version
> bump landed before that build). It is the build from before the wake word and
> carries `versionCode 6`, same as 3.3, so **install 3.7** unless you are
> reproducing history. Checksums for every file are in
> [`releases/README.md`](releases/README.md).

The APK grew from 65 MB to 101 MB in 3.3 because Vosk ships native recognition
libraries for **all four ABIs** (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`).
4.0 adds ~151 MB of on-device speech: sherpa-onnx natives for two ABIs (73 MB)
and the Piper + Kitten models (78 MB). An arm64-only build would shed roughly
35–40 MB; moving the voices to a first-run download would shed most of the rest.

---

## 17. Known limits and roadmap

| Limit | Why | Path forward |
|---|---|---|
| Wake word needs a 40 MB download | Vosk model is not bundled | ship a quantized/keyword-only model |
| APK is 223 MB | Vosk (4 ABIs) + sherpa-onnx (2 ABIs) + 78 MB of voice models | per-ABI splits, or download the neural voices on first run |
| No syntax highlighting | avoided a heavy highlighter | add a tokenizer or Prism port |
| STT needs Google speech service | `SpeechRecognizer` backend | bundle Whisper via ONNX |
| No image generation | not in chat completions | call `/images/generations` |
| Scheduled answers stay in the notification shade | headless run has no open chat | append them to a "Scheduled" conversation |
| Exact alarms need a system toggle (Android 12+) | platform policy for `SCHEDULE_EXACT_ALARM` | in-app banner + one-tap shortcut (done) |
| A job needs network at fire time | it is a real model request | retry once, then notify the failure (partial: notifies, no retry) |
| Cron syntax is the classic 5 fields | no seconds/years, as in most cron | add optional seconds field |
| Recall is keyword matching | no embeddings on a phone-sized budget | optional on-device embedding index |
| Providers may drop `tools` | the local bridge does | deterministic commands + recall preamble (done in 3.8) |
| Free models change often | OpenRouter catalogue moves | refresh `OPENROUTER_FREE` |
| Debug keystore | effortless side-loading | ship a real keystore |
| MCP endpoint is loopback-only | it is a phone-local tool server, not a LAN API | optional LAN binding behind an explicit allow-list |
| MCP exposes 5 of the 13 tools | clipboard, alarms and the UI need app-side context/presence | expose more once a safe remote-trigger exists |
| MCP needs the app installed and the service on | the socket lives in the app process | nothing to do — that is the design |
| An agent call cannot wake a stopped app | Android will not let a socket resurrect a killed process | the foreground service is the supported answer (done in 3.9) |
| No iOS build | Android-native bridges (Vosk, overlay, alarms) | port with platform modules |

---

## 18. Why this is not a ChatGPT clone

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

## 19. Credits

| Component | Author | Licence |
|---|---|---|
| React Native, React | Meta | MIT |
| Vosk / vosk-android | Alpha Cephei | Apache-2.0 |
| JNA | Java Native Access | Apache-2.0 / LGPL |
| Ionicons | Ionic | MIT |
| DuckDuckGo HTML endpoint | DuckDuckGo | unofficial, rate-limited |
| Open-Meteo | Open-Meteo | CC-BY-4.0 |
| sherpa-onnx | k2-fsa | Apache-2.0 |
| KittenTTS nano (v0.2) | KittenML | Apache-2.0 |
| Piper voice `en_US-lessac-low` | Rhasspy / Piper | MIT |
| espeak-ng data (phoneme tables) | eSpeak NG | GPL-3.0 |

Built and tested on a real **iQOO I2305** (Android 16, API 36, arm64-v8a),
with the laptop (Linux Mint, kernel 6.8) as the Ollama and bridge host.

---

## 20. Everything AmitAI can do — with examples

One page, no jargon. Every row below is something the app does **today**.
**Say** = type or speak it. **Tap** = press it in the UI.
If a feature needs a switch, it says which one.

### 20.1 Chat basics

| You can… | Do this | What happens |
|---|---|---|
| Ask anything | Say: *“explain VLAN tagging with a small example”* | answer streams in token by token |
| Stop a long answer | Tap ■ in the composer | request aborts, the partial answer stays |
| Try again | Tap **regenerate** under a reply | same question, same context, fresh answer |
| Copy an answer | Tap **copy** | whole reply to the clipboard |
| Share an answer | Android share sheet | send it to WhatsApp / Notes / anywhere |
| Copy one code block | Tap the copy icon on the block | only that snippet is copied |
| Keep a chat | — | every chat is saved automatically |
| Name it | Drawer → ⋯ → **rename** | your title replaces the auto one |
| Auto title | — | the first line you send becomes the title |
| Pin an important chat | Drawer → ⋯ → **pin** | stays at the top |
| Delete a chat | Drawer → ⋯ → **delete** | gone, no undo prompt |
| Find an old chat | Drawer → **Search chats** | searches every message, not just titles |
| Start clean | Drawer → **New chat** | new conversation, empty context |
| See the cost | under each reply | `6 tok`, model name, estimated $ |
| Understand a failure | — | 401 / 402 / 429 / offline are explained in plain words |

Example:

```
you:   summarise the OSI model in 7 bullets
AMITAI:  • Physical — cables, voltages …
         (arrives word by word; ■ stops it; regenerate re-asks)
```

### 20.2 Images (vision)

| You can… | Do this | What happens |
|---|---|---|
| Ask about one photo | Tap **+** → pick a photo → ask *“what is wrong in this error?”* | the image is sent as an image part |
| Ask about many photos | pick up to **8** | all eight go in one message |
| Compare them | *“what changed between these two screenshots?”* | the model sees all parts in order |
| Share a photo straight in | Gallery → Share → **AmitAI** | lands in the composer as an attachment |
| Share several at once | select 8 in Gallery → Share → **AmitAI** | all become attachments |

Images are converted to data URLs at send time and never stored in the chat file.

### 20.3 Web answers (with sources)

| You can… | Say | What happens |
|---|---|---|
| Get current facts | *“what's the latest Android version?”* | `web_search` (DuckDuckGo, no key) |
| Have it read the page | *“open the top result and summarise it”* | `open_page` → text extracted |
| Read a JavaScript-heavy site | Settings → Page reader → **Browser** | hidden WebView renders it |
| Limit the spend | Settings → **Pages per answer** (default 3) | hard cap on pages read |
| See where it got it | — | host chips under the answer |
| Turn it off completely | Settings → Tools → **Web search / Open pages** | the tool is not advertised at all |

```
you:   what changed in the latest React Native release?
AMITAI: … answer, with chips: reactnative.dev · github.com
```

### 20.4 Memory that survives restarts

| You can… | Say / tap | What happens |
|---|---|---|
| Save a fact | *“remember my bike service is in December”* | note written to the phone |
| Ask it back | *“when is my bike service?”* | `recall` finds it (works in a new chat) |
| Forget one | *“forget my bike service note”* | `forget` deletes it (asks if several match) |
| See everything it knows | ☰ → **Memory** | every note, with a timestamp and ✕ |
| Add a note by hand | Memory → *“Add a note yourself…”* | typed notes and AI notes live together |
| Delete everything | Memory → 🗑 | clears the list |
| Works with tool-less providers too | — | “remember …” is handled on-device, no model call |
| Search only memory | *“what do you know about me?”* | lists saved notes |

```
you:   remember my bike service will be in December
AMITAI: Saved to memory.
       ── next day, new chat ──
you:   when is my bike service?
AMITAI: In December.
```

### 20.5 Past conversations as context

| You can… | Say | What happens |
|---|---|---|
| Reference an old chat | *“what did we decide about the bridge?”* | `search_chats` ranks your saved conversations |
| Works without tools | same question | the best 4 excerpts are prepended to the prompt |
| Turn it off | Settings → Tools → **Chat history search** | no tool, no preamble |

### 20.6 Scheduled jobs (an alarm that answers)

| You can… | Say | What happens |
|---|---|---|
| Daily briefing | *“tell me the weather every day at 8 am”* | real `AlarmManager` alarm, fires at 08:00 |
| Weekly habit | *“remind me every Monday at 9pm to plan the week”* | repeats weekly |
| Weekdays only | *“weekdays at 7:30 give me the news”* | Mon–Fri |
| Every N hours | *“check the news every 2 hours”* | interval job |
| One-off | *“tomorrow at 7pm check the match score”* | fires once |
| Raw cron | *“schedule 30 7 * * 1-5 …”* | classic 5-field cron |
| No time given | *“remind me to water the plants”* | defaults to 09:00 and tells you so |
| See all jobs | ☰ → **Schedules** | next run, pause, delete, last result |
| Pause one | Schedules → pause | alarm cancelled, job kept |
| Stop one | *“delete the 8am weather job”* | `delete_schedule` cancels the alarm |
| Exact timing | Schedules banner → **Alarms & reminders** | one tap to the Android toggle |

At fire time the phone wakes a **Headless JS task** — no app on screen — runs the
same agent loop (tools included) and posts the answer as a notification. Tapping
the notification opens AmitAI.

### 20.7 Voice

| You can… | Do this | What happens |
|---|---|---|
| Dictate | Tap 🎤 | words appear while you speak (partial results) |
| Read answers aloud | Tap **speak** under a reply | the voice chosen in Settings, offline |
| Change the speed | Settings → Speaking speed | 0.5× – 2.0× |
| Use a neural voice | Settings → **Voice** → Piper or Kitten | on-device, free, no key |
| Pick a Kitten voice | Settings → Kitten → any of 8 | Bella · Jasper · Luna · Bruno · Rosie · Hugo · Kiki · Leo |
| Follow the words | open voice mode | transcript highlights and scrolls with the audio |
| Test a voice | Settings → **Test this voice** | speaks one sample sentence |
| Talk hands-free | Settings/voice mode | listen → think → speak → listen loop |
| Interrupt it | just talk over it | **barge-in** cuts the speech immediately |
| Stop by voice | say *“stop”*, *“wait”*, *“no”*, *“cancel”* | instant stop, no wake word needed |
| Avoid hearing itself | — | echo guard ignores the TTS audio it just played |

### 20.8 “Ok Amit” and the floating bubble

| You can… | Do this | What happens |
|---|---|---|
| Wake by voice | Settings → **Wake word** → download the 40 MB Vosk model | offline listener, no internet needed |
| Choose when it listens | **Charging / screen off** · **Always** · **Paused** | battery-aware default |
| Get a floating button | Settings → **Floating bubble** (needs overlay permission) | draggable “A”, tap → voice mode |
| Survive a reboot | enable either one | `BootReceiver` restores it |
| Never fight over the mic | — | the in-app mic always wins (`MicGate`) |

### 20.9 Getting text into the app

| Source | How | Result |
|---|---|---|
| Any app's share sheet | Share → **AmitAI** | text lands in the composer |
| Selected text | select → ⋮ → **AmitAI** (*Process text*) | same, without leaving the app you were in |
| Your clipboard | *“summarise what I copied”* | `read_clipboard` reads it once, on demand |
| A photo or eight | Gallery → Share → **AmitAI** | attachments in the composer |

There is no background clipboard watcher — the clipboard is read only when a
reply you asked for calls the tool.

### 20.10 Models and providers

| You can… | Do this | What happens |
|---|---|---|
| Use Gemini / OpenRouter / OpenAI | tap a provider chip | base URL, model and key hint are filled in |
| Use any compatible server | paste a Base URL | Ollama, LM Studio, vLLM, a gateway, your own |
| Use a local model | `http://<laptop-ip>:11434/v1` | nothing leaves your home network |
| Use the phone-local bridge | `http://127.0.0.1:8130/v1` | opencode on the phone answers |
| Keep several keys | switch providers and paste each key | each key is stored per provider |
| See what a server really serves | **Test connection** | `GET /models` → a live list |
| Pick from free models | Settings → free-model catalogue | 6 hand-tested OpenRouter models with notes |
| Tune the style | Temperature · Max tokens · Stream | 0–2, reply cap, streaming on/off |
| Ask for more reasoning | Reasoning effort `low/medium/high` | only sent to reasoning models |
| Change the personality | **Persona** → Code reviewer / Tutor / Network engineer / Editor | replaces the system prompt |
| Write your own | Settings → System prompt | sent as the `system` message |

### 20.11 Cost, quota and troubleshooting

| You can… | Where | What it shows |
|---|---|---|
| See this week | ☰ → Settings → **Usage this week** | requests, input/output tokens, estimated $ |
| See today's free quota | model picker | `Quota: 7/20 used today` |
| Know when it resets | model picker | `⛔ resets in 12 min` (parsed from the 429 body) |
| Reproduce a 429 offline | Diagnostics → **Simulate 429** | exercises the quota UI with no network |
| Start counting again | Diagnostics → **Reset counters** | clears quota + usage |

### 20.12 Look and feel

| Theme | Look |
|---|---|
| **Midnight OLED** | pure black, electric indigo — best on AMOLED |
| **Tokyo Night** | deep navy, neon cyan and lavender |
| **Cyber Obsidian** | carbon black, cyber emerald |

Plus an animated splash (ken-burns + spring logo), haptics on send, and a composer
that lifts by the real keyboard height (edge-to-edge).

### 20.13 Storage, files and backups

| You can… | Do this | What happens |
|---|---|---|
| Keep chats small and safe | default | SharedPreferences + AsyncStorage |
| Keep a huge history | Settings → **Move to `/sdcard/AmitAI`** | one JSON store you can back up |
| See where it lives | Settings → **Chat files** | folder path, free space, all-files grant |
| Never lose a write | — | past ~1.5 MB the oldest replies are stubbed, never a failed save |
| Upgrade safely | — | new settings merge over defaults, so nothing comes back `undefined` |

The MCP token also lives here (`SharedPreferences amitai:mcp_token`), generated once.

### 20.14 The opencode MCP server (3.9)

| You can… | Do this | What happens |
|---|---|---|
| Let the CLI agent use your notes | Settings → **Copy opencode.json snippet** → paste into `~/.config/opencode/opencode.json` → restart opencode | agent sees `remember`, `recall`, `search_chats`, `get_weather`, `get_time` |
| Ask from Termux | *“use the AmitAI tools to check the weather in Nagpur”* | the tool call appears in the transcript |
| Save across sessions | *“remember my tyre changed in March”* | note appears in ☰ → **Memory** |
| Keep it alive in the background | Settings → **Keep running in background** (default on) | foreground service + “AmitAI tools ready” notification |
| Turn it off | same toggle, or **Stop** in the notification | port `8140` closes |
| Check it is healthy | Settings → opencode MCP | URL, token, *listening · background service on* |

```
Termux $ opencode
> remember: my bike service is in December
  ⚙ amitai_remember {"text":"my bike service is in December"}
  "Saved."

> when is my bike service?          # brand-new session
  ⚙ amitai_recall {"query":"bike service"}
  "In December — per your note."
```

### 20.15 What it deliberately does not do

| Not supported | Why |
|---|---|
| Image generation | chat completions cannot generate images |
| Cloud sync / account | there is no AmitAI server |
| Analytics, crash reports, ads | never added, not even opt-out |
| Reading your clipboard in the background | only on an explicit tool call |
| Answering when the phone is off | a job needs power and network at fire time |
| LAN access to the MCP endpoint | loopback only, by design |
| Exposing clipboard/alarms over MCP | they need app-side intent and a person present |
| iOS build | the bridges are Android-native (Vosk, overlay, alarms) |

### 20.16 A day with AmitAI (all of it in one go)

```
07:30  ⏰  scheduled job fires while the phone is locked
           notification: "Weather: 24°C, light rain in Nagpur"

08:10  you share a screenshot of a build error from Chrome → AmitAI
           "This is a Gradle version mismatch — bump to 8.7."

08:12  you: "remember my bike service is in December"        → Memory
       you: "remind me every Monday at 9pm to plan the week" → Schedules

13:00  you: "what did we decide about the bridge?"           → search_chats
           "You decided the app hosts the MCP server, not the bridge."

20:00  you copy a long article, open AmitAI:
       "summarise what I copied"                             → read_clipboard
       tap speak                                             → read aloud

21:00  you say "Ok Amit" → bubble → ask by voice → barge in → "stop"

23:00  in Termux: opencode → "what's on my plate this week?"
           ⚙ amitai_recall → reads the notes you saved at 08:12
```

That is the whole app: **chat, vision, web, memory, history, schedules, voice,
wake word, bubble, sharing, clipboard, providers, usage, storage, themes and the
opencode MCP bridge** — all on the phone, with no server and no account.

---

<div align="center">

**If AmitAI is useful to you, star the repo — and read the code, it is all here.**

</div>
