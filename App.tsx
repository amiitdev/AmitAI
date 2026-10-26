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
} from 'react-native';
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
import { runAgent, fileToDataUrl, RunHandle, ping } from './src/api/openai';
import { makeExecutor } from './src/lib/agentTools';
import { applySchedules, loadSchedules } from './src/lib/schedules';
import { addNote, formatNotes, loadNotes } from './src/lib/memory';
import { parseMemoryCommand } from './src/lib/memoryCommands';
import { buildRecallPreamble } from './src/lib/history';
import { Bubble } from './src/components/Bubble';
import { Composer } from './src/components/Composer';
import { ConversationList } from './src/components/ConversationList';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SchedulesScreen } from './src/screens/SchedulesScreen';
import { MemoryScreen } from './src/screens/MemoryScreen';
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

type Screen = 'chat' | 'settings' | 'drawer' | 'schedules' | 'memory';

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
  const ready = useRef(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  /* ------------------------------- boot -------------------------------- */

  useEffect(() => {
    (async () => {
      const [s, list] = await Promise.all([loadSettings(), loadConversations()]);
      setSettings(s);
      if (s.theme) setTheme(s.theme);
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

  useEffect(() => {
    configureVoice({
      ttsProvider: settings.ttsProvider,
      elevenLabsKey: settings.elevenLabsKey,
      elevenLabsVoiceId: settings.elevenLabsVoiceId,
      ttsSpeed: settings.ttsSpeed,
    });
  }, [
    settings.ttsProvider,
    settings.elevenLabsKey,
    settings.elevenLabsVoiceId,
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
                  tokens: Math.ceil((text ?? m.content).length / 4),
                }
              : m,
          ),
        }));
        setStreaming(false);
        setToolStage(null);
        streamRef.current = null;
      };

      const exec = makeExecutor(settings);

      streamRef.current = runAgent(
        {
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          model: settings.model,
          messages: history,
          systemPrompt: recall
            ? `${settings.systemPrompt}\n\n${recall}`
            : settings.systemPrompt,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          stream: settings.stream,
          reasoningEffort: settings.reasoningEffort,
          simulate429: settings.simulate429,
          tools: exec.tools,
          maxRounds: settings.webSearch ? 3 : 1,
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
        const exec = makeExecutor(settings);

        voiceRunRef.current = runAgent(
          {
            baseUrl: settings.baseUrl,
            apiKey: settings.apiKey,
            model: settings.model,
            messages: history,
            systemPrompt: settings.systemPrompt,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            // voice wants the whole answer at once, to speak it in one go
            stream: false,
            reasoningEffort: settings.reasoningEffort,
            simulate429: settings.simulate429,
            tools: exec.tools,
            maxRounds: settings.webSearch ? 3 : 1,
            execute: exec.execute,
          },
          {
            onDelta: d => {
              full += d;
            },
            onSources: s2 => {
              srcs = s2;
            },
            onDone: t => {
              voiceRunRef.current = null;
              const answer = t || full;
              updateActive(c => ({
                ...c,
                messages: [
                  ...c.messages,
                  {
                    ...newMessage('assistant', answer),
                    model: settings.model,
                    tokens: Math.ceil(answer.length / 4),
                    sources: srcs.length ? srcs : undefined,
                  },
                ],
              }));
              resolve(answer);
            },
            onError: e => {
              voiceRunRef.current = null;
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

      <TouchableOpacity onPress={newChat} hitSlop={8} style={styles.newIcon}>
        <Ionicons name="create-outline" size={19} color={colors.text} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {voiceMode ? (
        <VoiceMode
          onClose={() => {
            voiceRunRef.current?.stop();
            setVoiceMode(false);
          }}
          onAsk={askForVoice}
          voiceLabel={
            settings.ttsProvider === 'elevenlabs' ? 'ElevenLabs voice' : 'Device voice'
          }
        />
      ) : screen === 'settings' ? (
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <SettingsScreen
            settings={settings}
            onChange={patchSettings}
            onBack={() => setScreen('chat')}
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
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
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

          {!!toolStage && (
            <View style={styles.toolChip}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text numberOfLines={1} style={styles.toolChipText}>
                {toolStage}
              </Text>
            </View>
          )}

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
