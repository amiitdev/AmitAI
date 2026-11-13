import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SplashScreen from './src/components/SplashScreen';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  StatusBar,
  Alert,
  BackHandler,
  ActivityIndicator,
  DeviceEventEmitter,
  AppState,
} from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';

import { Conversation, Message, Settings, Source, DEFAULT_SETTINGS, PRICES, OPENROUTER_FREE } from './src/types';
import { ToastProvider, useToast } from './src/components/Toast';
import { ActionSheet } from './src/components/Sheet';
import { consumeLaunchVoice, onWake } from './src/lib/assistant';
import { WebReader } from './src/components/WebReader';
import { VoiceMode } from './src/screens/VoiceMode';
import { configureVoice } from './src/lib/speech';
import { quotaHint } from './src/lib/quota';
import { useTheme, ThemeProvider, ThemeColors, font, radius, space } from './src/theme';
import {
  loadSettings,
  saveSettings,
  loadConversations,
  saveConversations,
  migrateConversationsToSd,
  newConversation,
  newMessage,
  titleFrom,
  trimForStorage,
} from './src/storage/store';
import { runAgent, fileToDataUrl, RunHandle, ping, isLocalEndpoint, RunStats } from './src/api/openai';
import { makeExecutor } from './src/lib/agentTools';
import { applySchedules, loadSchedules } from './src/lib/schedules';
import { addNote, formatNotes, loadNotes } from './src/lib/memory';
import { parseMemoryCommand } from './src/lib/memoryCommands';
import { buildRecallPreamble } from './src/lib/history';
import { isNearBottom } from './src/lib/chatScroll';
import { shouldLock } from './src/lib/lock';
import { autoBackupIfDue } from './src/lib/backup';
import { setSecureScreen } from './src/lib/native';
import { LockScreen } from './src/components/LockScreen';
import { Bubble } from './src/components/Bubble';
import { Composer } from './src/components/Composer';
import { ConversationList } from './src/components/ConversationList';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SchedulesScreen } from './src/screens/SchedulesScreen';
import { MemoryScreen } from './src/screens/MemoryScreen';
import { ActionModeScreen } from './src/screens/ActionModeScreen';
import { AutomationBar } from './src/components/AutomationBar';
import { ConfirmActionDialog } from './src/components/ConfirmActionDialog';
import {
  AutomationConfirmRequest,
  beginSession,
  confirmAction,
  endSession,
  hasAutomation,
  onAutomationConfirm,
  stopAutomation,
} from './src/lib/automation';
import { AUTOMATION_SYSTEM_PROMPT } from './src/lib/automationTools';
import { useAutomationStatus } from './src/lib/useAutomation';
import { useKeyboardHeight } from './src/lib/useKeyboard';
import { stopAllSpeech } from './src/lib/speech';
import {
  startListening,
  stopListening,
  cancelListening,
  pickImages,
  stopSpeaking,
  consumeShare,
  onShare,
  MAX_IMAGES,
  SharedPayload,
} from './src/lib/native';

type Screen = 'chat' | 'settings' | 'drawer' | 'schedules' | 'memory' | 'action';

const emptyConversation = () => newConversation();

const MODEL_FALLBACK = ['gpt-5.1', 'gpt-5.1-mini', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

/** Models that cannot answer a chat message, so we never offer them. */
const NOT_CHAT = /embedding|image|imagen|veo|tts|live|aqa|learnlm|guard|batch/i;

const baseHint = (m: string): string => {
  const p = PRICES[m];
  if (m.startsWith('gemini')) return 'Google · separate free-tier quota';
  if (m.startsWith('gpt')) return p ? `$${p.in}/M in · $${p.out}/M out` : 'OpenAI';
  return 'custom price';
};

function AppInner() {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { colors, setTheme } = useTheme();
  // Edge-to-edge Android does not resize for the keyboard, so lift the composer
  // by the IME height ourselves (see src/lib/useKeyboard.ts).
  const bottomPad = keyboard > 0 ? keyboard + space(2) : insets.bottom + space(2);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('chat');

  const [draft, setDraft] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [modelSheet, setModelSheet] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>(MODEL_FALLBACK);
  const [modelHints, setModelHints] = useState<Record<string, string>>({});
  const [modelLoading, setModelLoading] = useState(false);
  const [toolStage, setToolStage] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  /** locked at cold start (a PIN exists) and after a minute in the background */
  const [locked, setLocked] = useState(false);
  const awayAt = useRef<number | null>(null);

  // Action Mode: live state for the strip/header, and the one confirmation
  // dialog the agent can be blocked on. The listener is removed on unmount so a
  // late event can never set state on a screen that no longer exists.
  const automation = useAutomationStatus();
  const refreshAutomation = automation.refresh;
  const [confirmReq, setConfirmReq] = useState<AutomationConfirmRequest | null>(null);
  useEffect(() => {
    const off = onAutomationConfirm(req => setConfirmReq(req));
    return () => off();
  }, []);

  /** Escape hatch used by the strip, the header and the notification path. */
  const stopActionMode = useCallback(async () => {
    await stopAutomation().catch(() => {});
    refreshAutomation();
  }, [refreshAutomation]);

  /** The user's answer to a confirmation. Stable identity: the dialog's
   *  countdown effect must not restart on every streaming re-render. */
  const answerConfirm = useCallback(
    async (id: string, approved: boolean) => {
      setConfirmReq(null);
      await confirmAction(id, approved);
      refreshAutomation();
    },
    [refreshAutomation],
  );

  // Opened by "Ok Amit" or the floating bubble → jump straight into voice mode.
  useEffect(() => {
    const off = onWake(() => setVoiceMode(true));
    consumeLaunchVoice()
      .then(v => {
        if (v) setVoiceMode(true);
      })
      .catch(() => {});
    const cold = DeviceEventEmitter.addListener('AmitAssistantWake', () => setVoiceMode(true));
    return () => {
      off();
      cold.remove();
    };
  }, []);
  const toast = useToast();

  // "Share to AmitAI": the payload is pulled from native (not carried in the
  // event) so a share that arrived before React mounted still lands here.
  useEffect(() => {
    let live = true;
    const take = (p: SharedPayload) => {
      if (!live) return;
      if (p.text) setDraft(p.text);
      if (p.images.length) {
        setImageUris(prev => [...prev, ...p.images].slice(0, MAX_IMAGES));
      }
      toast(
        p.images.length
          ? `Shared ${p.images.length} image${p.images.length === 1 ? '' : 's'} into AmitAI`
          : 'Shared text into AmitAI',
        'info',
      );
    };
    consumeShare()
      .then(p => p && take(p))
      .catch(() => {});
    const off = onShare(() => {
      consumeShare()
        .then(p => p && take(p))
        .catch(() => {});
    });
    return () => {
      live = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const streamRef = useRef<RunHandle | null>(null);
  const voiceRunRef = useRef<RunHandle | null>(null);
  const sourcesRef = useRef<Source[]>([]);
  const listRef = useRef<FlatList<Message>>(null);

  /**
   * Follow the newest message — but only while the user is already at the
   * bottom.
   *
   * The old code scrolled to the end inside `onContentSizeChange` unconditionally.
   * A long chat re-measures cells while you scroll (virtualisation) and every
   * re-measure changes the content size, so reading an old message meant one
   * flick up and then a yank back down — over and over. Short chats never
   * re-measure after the first layout, which is why they were fine.
   */
  const atBottom = useRef(true);
  const didInitialScroll = useRef(false);
  /** Same facts as `atBottom`, but as state so the jump buttons can react. */
  const [scrollPos, setScrollPos] = useState({ atTop: true, atBottom: true });

  const onListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const m = e.nativeEvent;
    atBottom.current = isNearBottom(m);
    const atTop = m.contentOffset.y <= 40;
    setScrollPos(prev =>
      prev.atTop === atTop && prev.atBottom === atBottom.current
        ? prev
        : { atTop, atBottom: atBottom.current },
    );
  }, []);

  const jumpTop = useCallback(() => {
    atBottom.current = false;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const jumpBottom = useCallback(() => {
    atBottom.current = true;
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const followToEnd = useCallback((animated = false) => {
    if (!atBottom.current) return;
    listRef.current?.scrollToEnd({ animated });
  }, []);

  // Opening a chat starts at the newest message, like every other messenger.
  useEffect(() => {
    atBottom.current = true;
    didInitialScroll.current = false;
  }, [activeId]);
  const ready = useRef(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  /* ------------------------------- boot -------------------------------- */

  useEffect(() => {
    (async () => {
      const [s, list] = await Promise.all([loadSettings(), loadConversations()]);
      setSettings(s);
      if (s.theme) setTheme(s.theme);
      // A PIN means the chats do not open by themselves.
      if (s.appLock && s.pinHash) setLocked(true);
      if (list.length) {
        setConversations(list);
        setActiveId(list[0].id);
      } else {
        const c = emptyConversation();
        setConversations([c]);
        setActiveId(c.id);
      }
      ready.current = true;

      // Self-heal the alarm set on every launch: recompute each job's next run
      // from the stored list, so a timezone change, a skipped boot restore or a
      // stale native copy cannot leave a schedule pointing at the wrong hour.
      loadSchedules()
        .then(list => (list.length ? applySchedules(list) : undefined))
        .catch(() => {});
    })();
  }, [setTheme]);

  // Android hardware back: return to chat from Settings/drawer instead of exiting.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'chat') {
        setScreen('chat');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  /* ----------------------- lock, backup, screen ------------------------ */

  /**
   * Going to the background is the moment worth capturing: it is when the app
   * usually gets killed, and when a reinstall becomes likely. The throttle
   * lives in backup.ts, so a chatty session cannot litter the folder.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active') {
        // awayAt is only set on the way out; a first 'active' at cold start
        // must not relock a session the user just unlocked.
        if (
          awayAt.current !== null &&
          shouldLock({
            appLock: settings.appLock,
            hasPin: !!settings.pinHash,
            backgroundedAt: awayAt.current,
            now: Date.now(),
          })
        ) {
          setLocked(true);
        }
        return;
      }
      awayAt.current = Date.now();
      autoBackupIfDue({ settings }).catch(() => {});
    });
    return () => sub.remove();
  }, [settings]);

  // FLAG_SECURE follows the toggle: no screenshots, blank recents thumbnail.
  useEffect(() => {
    setSecureScreen(settings.blockScreenshots).catch(() => {});
  }, [settings.blockScreenshots]);

  useEffect(() => {
    configureVoice({
      ttsProvider: settings.ttsProvider,
      ttsVoice: settings.ttsVoice,
      ttsSpeed: settings.ttsSpeed,
    });
  }, [
    settings.ttsProvider,
    settings.ttsVoice,
    settings.ttsSpeed,
  ]);

  // persist settings
  useEffect(() => {
    if (ready.current) saveSettings(settings).catch(() => {});
  }, [settings]);

  // persist conversations (trimmed so AsyncStorage can't overflow; SD-card
  // storage has its own much larger ceiling and skips the trim)
  useEffect(() => {
    if (!ready.current) return;
    const t = setTimeout(() => {
      const { list } = trimForStorage(conversations, settings.storageMode);
      saveConversations(list).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [conversations, settings.storageMode]);

  // When the user switches to SD-card storage, copy existing conversations over
  // so nothing walks away in the old backend.
  useEffect(() => {
    if (ready.current && settings.storageMode === 'sdcard') {
      migrateConversationsToSd().catch(() => {});
    }
  }, [settings.storageMode]);

  const active = useMemo(
    () => conversations.find(c => c.id === activeId) ?? conversations[0],
    [conversations, activeId],
  );

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings(prev => {
        const next = { ...prev, ...patch };
        if (patch.theme) setTheme(patch.theme);
        return next;
      });
    },
    [setTheme],
  );

  /** Live list from the endpoint — every chat-capable model the key can use. */
  const openModelSheet = useCallback(async () => {
    setModelSheet(true);
    setModelLoading(true);

    // OpenRouter: only the hand-tested free coding/reasoning models are ever
    // offered — the endpoint itself lists 468 models, most of them paid.
    if (settings.baseUrl.includes('openrouter')) {
      setModelOptions(OPENROUTER_FREE.map(m => m.model));
      setModelHints(Object.fromEntries(OPENROUTER_FREE.map(m => [m.model, m.keyHint])));
      setModelLoading(false);
      return;
    }

    try {
      const ids = await ping(settings.baseUrl, settings.apiKey);
      const usable = ids.filter(id => !NOT_CHAT.test(id));
      if (usable.length) setModelOptions(usable.slice(0, 80));

      const hints: Record<string, string> = {};
      await Promise.all(
        usable.slice(0, 80).map(async m => {
          hints[m] = await quotaHint(m, baseHint(m));
        }),
      );
      setModelHints(hints);
    } catch {
      // offline / bad key: keep whatever we last showed
    } finally {
      setModelLoading(false);
    }
  }, [settings.baseUrl, settings.apiKey]);

  /* ---------------------------- conversation ---------------------------- */

  const updateActive = useCallback(
    (fn: (c: Conversation) => Conversation) => {
      setConversations(prev => {
        if (!prev.length) return prev;
        const id = activeId ?? prev[0].id;
        return prev.map(c => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c));
      });
    },
    [activeId],
  );

  const newChat = useCallback(() => {
    const c = emptyConversation();
    setConversations(prev => [c, ...prev]);
    setActiveId(c.id);
    setDraft('');
    setImageUris([]);
  }, []);

  const removeChat = useCallback(
    (id: string) => {
      setConversations(prev => {
        const next = prev.filter(c => c.id !== id);
        if (!next.length) {
          const c = emptyConversation();
          setActiveId(c.id);
          return [c];
        }
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId],
  );

  const renameChat = useCallback((id: string, title: string) => {
    setConversations(prev =>
      prev.map(c => (c.id === id ? { ...c, title, updatedAt: Date.now() } : c)),
    );
  }, []);

  const pinChat = useCallback((id: string) => {
    setConversations(prev => prev.map(c => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  }, []);

  /* -------------------------------- send -------------------------------- */

  const runCompletion = useCallback(
    (history: Message[], recall = '') => {
      const asst = { ...newMessage('assistant', ''), streaming: true, model: settings.model };
      // Name the chat after the first thing the user asked. `history` already
      // contains that message; `c.messages` is still the empty list for a new
      // chat, which is exactly the case we rename.
      const firstAsk = [...history].reverse().find(m => m.role === 'user')?.content ?? '';
      updateActive(c => ({
        ...c,
        title: c.messages.length === 0 ? titleFrom(firstAsk) : c.title,
        messages: [...history, asst],
      }));

      setStreaming(true);
      setToolStage(null);
      sourcesRef.current = [];

      let pending = '';
      // Timings for this reply, filled by onStats just before onDone.
      let stats: RunStats | null = null;

      const flush = () => {
        if (!pending) return;
        const chunk = pending;
        pending = '';
        updateActive(c => ({
          ...c,
          messages: c.messages.map(m =>
            m.id === asst.id ? { ...m, content: m.content + chunk } : m,
          ),
        }));
      };

      const timer = setInterval(flush, 60);

      const finalize = (opts: { text?: string; error?: string; sources?: Source[] }) => {
        clearInterval(timer);
        flush();
        const text = opts.text;
        const st = stats as RunStats | null;
        updateActive(c => ({
          ...c,
          messages: c.messages.map(m =>
            m.id === asst.id
              ? {
                  ...m,
                  content: text ?? m.content,
                  streaming: false,
                  error: opts.error,
                  sources: opts.sources?.length ? opts.sources : undefined,
                  tokens: st?.tokensOut ?? Math.ceil((text ?? m.content).length / 4),
                  exactTokens: st?.exact,
                  latencyMs: st?.totalMs,
                  ttftMs: st?.ttftMs,
                  tps: st?.tps,
                }
              : m,
          ),
        }));
        setStreaming(false);
        setToolStage(null);
        streamRef.current = null;
        // Release the phone: the turn is over, so the foreground service and
        // the "acting on screen" card go away even if the agent never called
        // stop_automation itself.
        if (hasAutomation && settings.actionMode) endSession().catch(() => {});
      };

      const exec = makeExecutor(settings);
      // A loopback GGUF prints tool calls as plain text, so it gets no tools at all.
      const local = isLocalEndpoint(settings.baseUrl);
      // Action Mode needs a longer tool budget: open → read → tap → read … and
      // an instruction block that makes "look at the screen" mandatory.
      const actionMode = hasAutomation && settings.actionMode && settings.toolsAutomation;
      const systemPrompt = [
        settings.systemPrompt,
        recall,
        actionMode ? AUTOMATION_SYSTEM_PROMPT : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      // A new user request is a fresh consent: it clears a previous emergency
      // stop so the model may act again, and it starts the foreground service
      // that keeps the process alive while Android shows another app.
      if (actionMode) {
        beginSession().catch(() => {});
      }

      streamRef.current = runAgent(
        {
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          model: settings.model,
          messages: history,
          systemPrompt,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          stream: settings.stream,
          reasoningEffort: settings.reasoningEffort,
          simulate429: settings.simulate429,
          tools: local ? undefined : exec.tools,
          maxRounds: local ? 1 : actionMode ? 12 : settings.webSearch ? 3 : 1,
          execute: exec.execute,
        },
        {
          onDelta: d => {
            pending += d;
          },
          onToolStart: (name, args) => setToolStage(exec.label(name, args)),
          onToolDone: () => setToolStage(null),
          onSources: srcs => {
            sourcesRef.current = srcs;
          },
          onStats: s => {
            stats = s;
          },
          onDone: text => finalize({ text: text || undefined, sources: sourcesRef.current }),
          onError: err => finalize({ error: err.message }),
        },
      );
    },
    [settings, updateActive],
  );

  /** An answer produced on-device (memory commands), no network involved. */
  const localExchange = useCallback(
    (ask: string, answer: string) => {
      updateActive(c => ({
        ...c,
        title: c.messages.length === 0 ? titleFrom(ask) : c.title,
        messages: [...c.messages, newMessage('user', ask), newMessage('assistant', answer)],
      }));
    },
    [updateActive],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    const attachments = imageUris.slice(0, MAX_IMAGES);
    // Images with no caption are a valid message now.
    if ((!text && !attachments.length) || streaming || !active) return;

    // A message you just sent is the one thing that should always pull the
    // list down, even if you had scrolled up to re-read something.
    atBottom.current = true;

    // Handled on-device: some providers (the local bridge) drop `tools`.
    const cmd = text && !attachments.length ? parseMemoryCommand(text) : null;
    if (cmd?.kind === 'remember') {
      try {
        const note = await addNote(cmd.text);
        setDraft('');
        localExchange(text, `Saved to memory: ${note.text}`);
        toast('Saved to memory', 'ok');
      } catch (e: any) {
        toast(e?.message ?? 'Could not save that', 'error');
      }
      return;
    }
    if (cmd?.kind === 'recall') {
      const notes = await loadNotes();
      const recent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 20);
      setDraft('');
      localExchange(
        text,
        notes.length
          ? `From memory (${notes.length} note${notes.length === 1 ? '' : 's'}):\n\n${formatNotes(recent)}`
          : 'Nothing saved yet. Say “remember that …” and it stays on this phone.',
      );
      return;
    }

    if (!settings.apiKey && !settings.baseUrl.includes('11434')) {
      toast('Add your API key first', 'error');
      setScreen('settings');
      return;
    }

    const msg: Message = { ...newMessage('user', text) };
    if (attachments.length) {
      // Built here, never persisted: base64 in AsyncStorage would blow it up.
      const datas: string[] = [];
      for (const uri of attachments) {
        try {
          datas.push(await fileToDataUrl(uri));
        } catch {
          /* one unreadable file should not lose the rest */
        }
      }
      if (datas.length) {
        msg.imageDatas = datas;
        msg.imageUris = attachments.slice(0, datas.length);
      } else {
        Alert.alert('Images', 'Could not read those images, sending text only.');
      }
    }

    setDraft('');
    setImageUris([]);

    const history = [...active.messages.filter(m => !m.error), msg];
    const recall = await buildRecallPreamble(text, active.id).catch(() => '');
    runCompletion(history, recall);
  }, [draft, streaming, active, settings, imageUris, runCompletion, toast, localExchange]);

  const stop = useCallback(() => {
    streamRef.current?.stop();
    streamRef.current = null;
    setStreaming(false);
    setToolStage(null);
    // Stopping a reply that was driving the phone must also let go of the phone.
    if (hasAutomation) stopAutomation().catch(() => {});
    updateActive(c => ({
      ...c,
      messages: c.messages.map(m => (m.streaming ? { ...m, streaming: false } : m)),
    }));
  }, [updateActive]);

  const regenerate = useCallback(async () => {
    if (!active || streaming) return;
    const msgs = [...active.messages];
    while (msgs.length && msgs[msgs.length - 1].role === 'assistant') msgs.pop();
    if (!msgs.length) return;
    const lastAsk = [...msgs].reverse().find(m => m.role === 'user')?.content ?? '';
    const recall = await buildRecallPreamble(lastAsk, active.id).catch(() => '');
    runCompletion(msgs, recall);
  }, [active, streaming, runCompletion]);

  /**
   * One voice exchange: append the question, run the agent, append the answer,
   * resolve with the text so VoiceMode can speak it.
   */
  const askForVoice = useCallback(
    (text: string) =>
      new Promise<string>((resolve, reject) => {
        if (!active) return reject(new Error('No open chat'));
        // Cancel any pending voice generation immediately on interruption
        voiceRunRef.current?.stop();
        const userMsg = { ...newMessage('user', text) };
        const history = [...active.messages.filter(m => !m.error), userMsg];

        updateActive(c => ({
          ...c,
          title: c.messages.length === 0 ? titleFrom(text) : c.title,
          messages: [...c.messages, userMsg],
        }));

        let full = '';
        let srcs: Source[] = [];
        let voiceStats: RunStats | null = null;
        const exec = makeExecutor(settings);
        const localVoice = isLocalEndpoint(settings.baseUrl);
        const voiceAction = hasAutomation && settings.actionMode && settings.toolsAutomation;
        const voicePrompt = voiceAction
          ? `${settings.systemPrompt}\n\n${AUTOMATION_SYSTEM_PROMPT}`
          : settings.systemPrompt;
        if (voiceAction) beginSession().catch(() => {});

        voiceRunRef.current = runAgent(
          {
            baseUrl: settings.baseUrl,
            apiKey: settings.apiKey,
            model: settings.model,
            messages: history,
            systemPrompt: voicePrompt,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            // voice wants the whole answer at once, to speak it in one go
            stream: false,
            reasoningEffort: settings.reasoningEffort,
            simulate429: settings.simulate429,
            tools: localVoice ? undefined : exec.tools,
            maxRounds: localVoice ? 1 : voiceAction ? 12 : settings.webSearch ? 3 : 1,
            execute: exec.execute,
          },
          {
            onDelta: d => {
              full += d;
            },
            onSources: s2 => {
              srcs = s2;
            },
            onStats: s2 => {
              voiceStats = s2;
            },
            onDone: t => {
              voiceRunRef.current = null;
              if (hasAutomation && settings.actionMode) endSession().catch(() => {});
              const answer = t || full;
              const st = voiceStats as RunStats | null;
              updateActive(c => ({
                ...c,
                messages: [
                  ...c.messages,
                  {
                    ...newMessage('assistant', answer),
                    model: settings.model,
                    tokens: st?.tokensOut ?? Math.ceil(answer.length / 4),
                    exactTokens: st?.exact,
                    latencyMs: st?.totalMs,
                    ttftMs: st?.ttftMs,
                    tps: st?.tps,
                    sources: srcs.length ? srcs : undefined,
                  },
                ],
              }));
              resolve(answer);
            },
            onError: e => {
              voiceRunRef.current = null;
              if (hasAutomation && settings.actionMode) endSession().catch(() => {});
              reject(e);
            },
          },
        );
      }),
    [active, settings, updateActive],
  );

  /* -------------------------------- voice ------------------------------- */

  const toggleMic = useCallback(async () => {
    if (listening) {
      await stopListening();
      setListening(false);
      return;
    }
    const ok = await startListening((text, final) => {
      if (text) setDraft(text);
      if (final) setListening(false);
    });
    if (!ok) Alert.alert('Voice input', 'Speech module not linked in this build.');
    else setListening(true);
  }, [listening]);

  useEffect(() => () => { cancelListening(); stopSpeaking(); }, []);

  // Changing chat or opening settings should not leave a voice talking.
  useEffect(() => {
    stopAllSpeech();
  }, [activeId, screen]);

  /* -------------------------------- render ------------------------------ */

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + space(2) }]}>
      <TouchableOpacity style={styles.menuBtn} onPress={() => setScreen('drawer')} hitSlop={8}>
        <Ionicons name="menu" size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {active?.title ?? 'AmitAI'}
        </Text>
        <TouchableOpacity style={styles.modelPill} onPress={openModelSheet} hitSlop={6}>
          <Ionicons name="sparkles" size={11} color={colors.accent} />
          <Text numberOfLines={1} style={styles.headerSub}>
            {settings.model}
          </Text>
          <Ionicons name="chevron-down" size={11} color={colors.textFaint} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={() => setVoiceMode(true)} hitSlop={8} style={styles.newIcon}>
        <Ionicons name="call-outline" size={18} color={colors.accent} />
      </TouchableOpacity>

      {hasAutomation && (
        <TouchableOpacity
          onPress={() => setScreen('action')}
          hitSlop={8}
          style={styles.newIcon}
        >
          <Ionicons
            name={settings.actionMode ? 'hand-left' : 'hand-left-outline'}
            size={18}
            color={settings.actionMode ? colors.accent : colors.textDim}
          />
          {settings.actionMode && (
            <View
              style={[
                styles.actionDot,
                {
                  backgroundColor:
                    automation.status?.session_active || automation.status?.status === 'running'
                      ? colors.ok
                      : colors.accent,
                },
              ]}
            />
          )}
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={newChat} hitSlop={8} style={styles.newIcon}>
        <Ionicons name="create-outline" size={19} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {locked && settings.pinHash ? (
        <LockScreen
          pin={{ salt: settings.pinSalt, hash: settings.pinHash }}
          onUnlock={() => setLocked(false)}
        />
      ) : voiceMode ? (
        <VoiceMode
          onClose={() => {
            voiceRunRef.current?.stop();
            setVoiceMode(false);
          }}
          onAsk={askForVoice}
          voiceLabel={
            settings.ttsProvider === 'device'
              ? 'Device voice'
              : settings.ttsProvider === 'piper'
                ? 'Piper voice'
                : 'Kitten voice'
          }
        />
      ) : screen === 'settings' ? (
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <SettingsScreen
            settings={settings}
            onChange={patchSettings}
            onBack={() => setScreen('chat')}
            onActionMode={() => setScreen('action')}
            onClearChats={() => {
              const c = emptyConversation();
              setConversations([c]);
              setActiveId(c.id);
              setScreen('chat');
            }}
          />
        </View>
      ) : screen === 'schedules' ? (
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <SchedulesScreen onBack={() => setScreen('chat')} />
        </View>
      ) : screen === 'memory' ? (
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <MemoryScreen onBack={() => setScreen('chat')} />
        </View>
      ) : screen === 'action' ? (
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <ActionModeScreen
            settings={settings}
            onChange={patchSettings}
            onBack={() => setScreen('chat')}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {header}

          <FlatList
            ref={listRef}
            data={active?.messages ?? []}
            keyExtractor={m => m.id}
            contentContainerStyle={[styles.list, { paddingBottom: keyboard > 0 ? keyboard + space(8) : space(8) }]}
            renderItem={({ item, index }) => (
              <Bubble
                message={item}
                canRegenerate={
                  !streaming &&
                  item.role === 'assistant' &&
                  index === (active?.messages.length ?? 1) - 1
                }
                onRegenerate={regenerate}
              />
            )}
            onScroll={onListScroll}
            scrollEventThrottle={16}
            onContentSizeChange={() => followToEnd(false)}
            onLayout={() => {
              if (didInitialScroll.current) return;
              didInitialScroll.current = true;
              listRef.current?.scrollToEnd({ animated: false });
            }}
            ListEmptyComponent={
              <View style={styles.welcome}>
                <Text style={styles.welcomeTitle}>AmitAI</Text>
                <Text style={styles.welcomeSub}>
                  {settings.apiKey || settings.baseUrl.includes('11434')
                    ? 'Ask anything. Streaming, markdown, code, images, voice.'
                    : 'Add your API key in Settings to start.'}
                </Text>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />

          {(screen === 'chat' && !voiceMode && (scrollPos.atBottom === false || scrollPos.atTop === false)) && (
            <View style={styles.jumpCol} pointerEvents="box-none">
              {!scrollPos.atTop && (
                <TouchableOpacity style={styles.jumpBtn} onPress={jumpTop} activeOpacity={0.8}>
                  <Ionicons name="chevron-up" size={20} color={colors.text} />
                </TouchableOpacity>
              )}
              {!scrollPos.atBottom && (
                <TouchableOpacity
                  style={[styles.jumpBtn, styles.jumpBtnAccent]}
                  onPress={jumpBottom}
                  activeOpacity={0.8}
                >
                  <Ionicons name="chevron-down" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {!!toolStage && (
            <View style={styles.toolChip}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text numberOfLines={1} style={styles.toolChipText}>
                {toolStage}
              </Text>
            </View>
          )}

          <AutomationBar
            status={automation.status}
            onOpen={() => setScreen('action')}
            onStop={stopActionMode}
          />

          <View style={[styles.composerWrap, { paddingBottom: bottomPad }]}>
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={send}
              onStop={stop}
              streaming={streaming}
              imageUris={imageUris}
              onPickImages={async () => {
                const room = MAX_IMAGES - imageUris.length;
                if (room <= 0) return;
                const picked = await pickImages(room);
                if (!picked.length) return;
                setImageUris(prev =>
                  [...prev, ...picked.filter(u => !prev.includes(u))].slice(0, MAX_IMAGES),
                );
              }}
              onRemoveImage={uri => setImageUris(prev => prev.filter(u => u !== uri))}
              listening={listening}
              onMic={toggleMic}
              disabled={!settings.apiKey && !settings.baseUrl.includes('11434')}
              webOn={settings.webSearch}
              onToggleWeb={() => {
                patchSettings({ webSearch: !settings.webSearch });
                toast(settings.webSearch ? 'Web search off' : 'Web search on', 'info');
              }}
            />
          </View>
        </View>
      )}

      <WebReader />

      <ConfirmActionDialog request={confirmReq} onAnswer={answerConfirm} />

      <ActionSheet
        visible={modelSheet}
        title="Model"
        onClose={() => setModelSheet(false)}
        items={modelOptions.map(m => ({
          label: m,
          icon: settings.model === m ? ('checkmark-circle' as const) : ('ellipse-outline' as const),
          hint: modelHints[m] ?? baseHint(m),
          onPress: () => {
            patchSettings({ model: m });
            toast(`Model set to ${m}`, 'info');
          },
        }))}
        loading={modelLoading}
      />

      <Modal
        visible={screen === 'drawer'}
        animationType="fade"
        transparent
        onRequestClose={() => setScreen('chat')}
      >
        <View style={styles.drawerWrap}>
          <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={() => setScreen('chat')} />
          <View style={[styles.drawer, { paddingTop: insets.top }]}>
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              onSelect={setActiveId}
              onNew={newChat}
              onDelete={removeChat}
              onPin={pinChat}
              onRename={renameChat}
              onClose={() => setScreen('chat')}
              onSettings={() => setScreen('settings')}
              onSchedules={() => setScreen('schedules')}
              onMemory={() => setScreen('memory')}
              onActionMode={() => setScreen('action')}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = React.useState(true);
  // Stable identity: the splash effect depends on onDone, and a fresh arrow on
  // every render would restart its animations and 2.6 s timer.
  const hideSplash = React.useCallback(() => setShowSplash(false), []);
  if (showSplash) return <SplashScreen onDone={hideSplash} />;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ToastProvider>
          <AppInner />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space(4),
    paddingBottom: space(3),
    gap: space(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuBtn: { width: 32, height: 32, justifyContent: 'center' },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  headerSub: { color: colors.textDim, fontSize: 11 },
  modelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1),
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  newIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  newIconText: { color: colors.text, fontSize: 15 },
  list: { padding: space(4), paddingBottom: space(8) },
  welcome: { marginTop: space(24), alignItems: 'center', paddingHorizontal: space(6) },
  welcomeTitle: { ...font.h1, color: colors.accent, fontSize: 34, letterSpacing: -1 },
  welcomeSub: {
    color: colors.textDim,
    fontSize: 14,
    textAlign: 'center',
    marginTop: space(3),
    lineHeight: 21,
  },
  composerWrap: { paddingHorizontal: space(4), paddingTop: space(1) },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    alignSelf: 'flex-start',
    marginHorizontal: space(4),
    marginBottom: space(2),
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    maxWidth: '88%',
  },
  toolChipText: { color: colors.textDim, fontSize: 12, flexShrink: 1 },
  /** Jump-to-top / jump-to-bottom, floating over the last message. */
  jumpCol: {
    position: 'absolute',
    right: space(3),
    bottom: space(22),
    gap: space(2),
    alignItems: 'center',
  },
  jumpBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  jumpBtnAccent: { backgroundColor: colors.accent, borderColor: colors.accent },
  drawerWrap: { flex: 1, flexDirection: 'row' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  drawer: {
    width: '84%',
    maxWidth: 360,
    backgroundColor: colors.bgRaised,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
});
