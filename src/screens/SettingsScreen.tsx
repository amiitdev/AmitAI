import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Settings, PRESETS, DEFAULT_SETTINGS, KITTEN_VOICES, PROVIDERS, OPENROUTER_FREE, ProviderDef } from '../types';
import { getWeeklyUsage, resetUsage } from '../lib/usage';
import { useTheme, THEMES, ThemeKey, ThemeColors, radius, space, mono } from '../theme';
import { ping } from '../api/openai';
import { hasSTT, hasTTS, hasPicker, openTtsSettings, ttsStatus, mcpInfo, setMcpService, copyText, McpInfo } from '../lib/native';
import { useKeyboardHeight } from '../lib/useKeyboard';
import { speakAloud, stopAllSpeech } from '../lib/speech';
import { resetQuota } from '../lib/quota';
import { AssistantSection } from '../components/AssistantSection';
import { StorageSection } from '../components/StorageSection';

/** Model chips offered per endpoint — only models that were verified there. */
const MODELS_FOR = (url: string): string[] => {
  if (url.includes('openrouter')) return OPENROUTER_FREE.map(m => m.model);
  if (url.includes('generativelanguage')) {
    return [
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash-lite',
      'gemini-2.5-flash',
    ];
  }
  if (url.includes('11434')) return [];
  return ['gpt-5.1', 'gpt-5.1-mini', 'gpt-4.1-mini', 'gpt-4o-mini'];
};

/** Short reason to pick each OpenRouter free model, keyed by model id. */
const OR_HINTS: Record<string, string> = Object.fromEntries(
  OPENROUTER_FREE.map(m => [m.model, m.keyHint]),
);

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
  onClearChats: () => void;
}

export function SettingsScreen({ settings, onChange, onBack, onClearChats }: Props) {
  const { colors, theme, setTheme } = useTheme();      const [testing, setTesting] = useState(false);
  const [ttsInfo, setTtsInfo] = useState<Awaited<ReturnType<typeof ttsStatus>>>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof getWeeklyUsage>> | null>(null);
  const [mcp, setMcp] = useState<McpInfo | null>(null);
  const keyboard = useKeyboardHeight();

  useEffect(() => {
    mcpInfo().then(setMcp).catch(() => {});
  }, []);

  useEffect(() => {
    getWeeklyUsage(settings.model).then(u => setUsage(u)).catch(() => {});
  }, [settings.model]);

  // Which engine/language the phone actually managed to open. Without this
  // the only symptom of a phone with no voice data installed is silence.
  useEffect(() => {
    ttsStatus()
      .then(setTtsInfo)
      .catch(() => {});
  }, []);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const test = async () => {
    setTesting(true);
    setModels(null);
    try {
      const list = await ping(settings.baseUrl, settings.apiKey);
      setModels(list);
      Alert.alert('Connected', `${list.length} models visible on this endpoint.`);
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Unknown error');
    } finally {
      setTesting(false);
    }
  };

  const handleThemeSelect = (key: ThemeKey) => {
    setTheme(key);
    onChange({ theme: key });
  };

  /** Which provider chip is lit right now — also the vault slot the key
   *  currently in the field belongs to. */
  const currentProvider = PROVIDERS.find(p => p.url === settings.baseUrl);
  const currentName = currentProvider?.name ?? 'custom';

  /**
   * Switch endpoint. The key field always holds the *active* provider's key,
   * so we file it under that provider's name, then pull out the new one —
   * Gemini and OpenRouter keys coexist without ever overwriting each other.
   */
  const switchProvider = (p: ProviderDef) => {
    const vault = { ...settings.providerKeys, [currentName]: settings.apiKey };
    onChange({
      baseUrl: p.url,
      model: p.model,
      providerKeys: vault,
      apiKey: vault[p.name] ?? '',
    });
    setModels(null);
  };

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={[styles.content, { paddingBottom: space(12) + keyboard }]}
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={[0]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* ----------------- Dark Themes Section ----------------- */}
      <Text style={styles.section}>Appearance & Dark Themes</Text>
      <View style={styles.themeList}>
        {(Object.keys(THEMES) as ThemeKey[]).map(key => {
          const t = THEMES[key];
          const active = (settings.theme || theme) === key;
          return (
            <TouchableOpacity
              key={key}
              activeOpacity={0.8}
              style={[
                styles.themeCard,
                active && { borderColor: t.previewAccent, backgroundColor: t.bgRaised },
              ]}
              onPress={() => handleThemeSelect(key)}
            >
              <View style={[styles.themeSwatch, { backgroundColor: t.bg, borderColor: t.border }]}>
                <View style={[styles.themeAccentDot, { backgroundColor: t.previewAccent }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.themeName, active && { color: t.previewAccent }]}>{t.name}</Text>
                <Text style={styles.themeDesc}>{t.description}</Text>
              </View>
              {active ? (
                <Ionicons name="checkmark-circle" size={22} color={t.previewAccent} />
              ) : (
                <Ionicons name="ellipse-outline" size={20} color={colors.textFaint} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.section}>Connection</Text>
      <View style={styles.chips}>
        {PROVIDERS.map(p => {
          const on = settings.baseUrl === p.url;
          return (
            <TouchableOpacity
              key={p.name}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => switchProvider(p)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Base URL</Text>
        <TextInput
          style={styles.input}
          value={settings.baseUrl}
          onChangeText={t => onChange({ baseUrl: t })}
          placeholder="https://api.openai.com/v1"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Anything OpenAI-compatible. Phone bridge: http://127.0.0.1:8130/v1</Text>
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>API key{currentProvider ? ` · ${currentName}` : ''}</Text>
        <TextInput
          style={styles.input}
          value={settings.apiKey}
          onChangeText={t =>
            onChange({ apiKey: t, providerKeys: { ...settings.providerKeys, [currentName]: t } })
          }
          placeholder="sk-..."
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          {currentProvider?.keyHint ??
            'Stored on this device only. Never leaves it except in the request header.'}
        </Text>
      </View>

      <TouchableOpacity style={styles.testBtn} onPress={test} disabled={testing}>
        {testing ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.testText}>Test connection</Text>
        )}
      </TouchableOpacity>

      {!!models?.length && (
        <View style={styles.models}>
          <Text style={styles.label}>Models on this endpoint</Text>
          <Text style={styles.modelsText}>{models.slice(0, 30).join('\n')}</Text>
        </View>
      )}

      <Text style={styles.section}>Model</Text>
      <View style={styles.field}>
        <Text style={styles.label}>Model id</Text>
        <TextInput
          style={styles.input}
          value={settings.model}
          onChangeText={t => onChange({ model: t })}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <View style={styles.chips}>
        {MODELS_FOR(settings.baseUrl).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.chip, settings.model === m && styles.chipOn]}
            onPress={() => onChange({ model: m })}
          >
            <Text style={[styles.chipText, settings.model === m && styles.chipTextOn]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!OR_HINTS[settings.model] && (
        <Text style={styles.hint}>{OR_HINTS[settings.model]}</Text>
      )}

      <Text style={styles.section}>Generation</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Temperature</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            onPress={() => onChange({ temperature: Math.max(0, +(settings.temperature - 0.1).toFixed(1)) })}
            style={styles.stepBtn}
          >
            <Text style={styles.stepText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepVal}>{settings.temperature.toFixed(1)}</Text>
          <TouchableOpacity
            onPress={() => onChange({ temperature: Math.min(2, +(settings.temperature + 0.1).toFixed(1)) })}
            style={styles.stepBtn}
          >
            <Text style={styles.stepText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Max tokens</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            onPress={() => onChange({ maxTokens: Math.max(256, settings.maxTokens - 512) })}
            style={styles.stepBtn}
          >
            <Text style={styles.stepText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepVal}>{settings.maxTokens}</Text>
          <TouchableOpacity
            onPress={() => onChange({ maxTokens: Math.min(16384, settings.maxTokens + 512) })}
            style={styles.stepBtn}
          >
            <Text style={styles.stepText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Stream replies</Text>
        <TouchableOpacity
          onPress={() => onChange({ stream: !settings.stream })}
          style={[styles.toggle, settings.stream && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.stream && styles.knobOn]} />
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Reasoning effort</Text>
      <View style={styles.chips}>
        {(['off', 'low', 'medium', 'high'] as const).map(v => (
          <TouchableOpacity
            key={v}
            style={[styles.chip, settings.reasoningEffort === v && styles.chipOn]}
            onPress={() => onChange({ reasoningEffort: v })}
          >
            <Text style={[styles.chipText, settings.reasoningEffort === v && styles.chipTextOn]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.section}>Tools</Text>
      <Text style={styles.hint}>Local tools the model can use in any chat. No key needed.</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Weather</Text>
        <TouchableOpacity
          onPress={() => onChange({ toolsWeather: !settings.toolsWeather })}
          style={[styles.toggle, settings.toolsWeather && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.toolsWeather && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Calculator</Text>
        <TouchableOpacity
          onPress={() => onChange({ toolsCalculator: !settings.toolsCalculator })}
          style={[styles.toggle, settings.toolsCalculator && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.toolsCalculator && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Time / timezone</Text>
        <TouchableOpacity
          onPress={() => onChange({ toolsTime: !settings.toolsTime })}
          style={[styles.toggle, settings.toolsTime && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.toolsTime && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Clipboard</Text>
        <TouchableOpacity
          onPress={() => onChange({ toolsClipboard: !settings.toolsClipboard })}
          style={[styles.toggle, settings.toolsClipboard && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.toolsClipboard && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Memory (notes)</Text>
        <TouchableOpacity
          onPress={() => onChange({ toolsMemory: !settings.toolsMemory })}
          style={[styles.toggle, settings.toolsMemory && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.toolsMemory && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Scheduled jobs</Text>
        <TouchableOpacity
          onPress={() => onChange({ toolsSchedules: !settings.toolsSchedules })}
          style={[styles.toggle, settings.toolsSchedules && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.toolsSchedules && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Chat history search</Text>
        <TouchableOpacity
          onPress={() => onChange({ toolsChatHistory: !settings.toolsChatHistory })}
          style={[styles.toggle, settings.toolsChatHistory && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.toolsChatHistory && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Clipboard lets the model read what you last copied. Memory is a note list you can
        inspect in the drawer. Scheduled jobs run the same tools on an alarm, with the app
        closed.
      </Text>

      <Text style={styles.section}>opencode MCP</Text>
      <Text style={styles.hint}>
        Loopback endpoint where the opencode agent can call AmitAI's own tools
        (memory, chat search, weather, time).
      </Text>
      {mcp ? (
        <>
          <View style={styles.usageCard}>
            <Text selectable style={styles.mcpLine}>{mcp.url}</Text>
            <Text selectable style={styles.mcpLine}>Bearer {mcp.token}</Text>
            <Text style={styles.hint}>
              {mcp.service
                ? 'listening · background service on'
                : mcp.running
                ? 'listening · only while AmitAI is open'
                : 'not listening'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Keep running in background</Text>
            <TouchableOpacity
              onPress={async () => {
                const next = !mcp.service;
                setMcp({ ...mcp, service: next });
                await setMcpService(next);
                setTimeout(() => {
                  mcpInfo().then(setMcp).catch(() => {});
                }, 900);
              }}
              style={[styles.toggle, mcp.service && styles.toggleOn]}
              activeOpacity={0.8}
            >
              <View style={[styles.knob, mcp.service && styles.knobOn]} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Without this, Android freezes the app when it is not on screen: the port stays open
            but nothing answers, and the agent times out. On = a small “AmitAI tools ready”
            notification stays in the shade.
          </Text>
          <TouchableOpacity
            style={styles.resetUsageBtn}
            onPress={() => {
              const snippet = JSON.stringify(
                {
                  mcp: {
                    amitai: {
                      type: 'remote',
                      url: mcp.url,
                      enabled: true,
                      headers: { Authorization: `Bearer ${mcp.token}` },
                    },
                  },
                },
                null,
                2,
              );
              copyText(snippet);
              Alert.alert('Copied', 'Paste under "mcp" in ~/.config/opencode/opencode.json, then restart opencode.');
            }}
          >
            <Text style={styles.resetText}>Copy opencode.json snippet</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={styles.hint}>MCP server is not available in this build.</Text>
      )}

      <Text style={styles.section}>Storage</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Store chats on SD card</Text>
        <TouchableOpacity
          onPress={() => onChange({ storageMode: settings.storageMode === 'sdcard' ? 'default' : 'sdcard' })}
          style={[styles.toggle, settings.storageMode === 'sdcard' && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.storageMode === 'sdcard' && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        Moves conversation history off AsyncStorage onto the app-private downloads folder.
        Useful when you keep long chat histories. Switches back cleanly too.
      </Text>

      <Text style={styles.section}>Usage this week</Text>
      {usage ? (          <View style={styles.usageCard}>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Requests</Text>
            <Text style={styles.usageVal}>{usage.total.requests}</Text>
          </View>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Input tokens</Text>
            <Text style={styles.usageVal}>{usage.total.tokensIn.toLocaleString()}</Text>
          </View>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Output tokens</Text>
            <Text style={styles.usageVal}>{usage.total.tokensOut.toLocaleString()}</Text>
          </View>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Est. cost ({settings.model})</Text>
            <Text style={styles.usageVal}>${usage.total.cost.toFixed(2)}</Text>
          </View>
          <TouchableOpacity style={styles.resetUsageBtn} onPress={() => { resetUsage(); setUsage(null); }}>
            <Text style={styles.resetText}>Reset usage counters</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.hint}>No usage recorded yet this week.</Text>
      )}

      <Text style={styles.section}>Web access</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Search the web</Text>
        <TouchableOpacity
          onPress={() => onChange({ webSearch: !settings.webSearch })}
          style={[styles.toggle, settings.webSearch && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.webSearch && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Open pages it finds</Text>
        <TouchableOpacity
          onPress={() => onChange({ webRead: !settings.webRead })}
          style={[styles.toggle, settings.webRead && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.webRead && styles.knobOn]} />
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Page reader</Text>
      <View style={styles.chips}>
        {(
          [
            ['fetch', 'Fast', 'plain HTML, ~0.3 s'],
            ['browser', 'Browser', 'renders JS, ~3 s'],
          ] as const
        ).map(([mode, label, hint]) => (
          <TouchableOpacity
            key={mode}
            style={[styles.chip, settings.readerMode === mode && styles.chipOn]}
            onPress={() => onChange({ readerMode: mode })}
          >
            <Text
              style={[styles.chipText, settings.readerMode === mode && styles.chipTextOn]}
            >
              {label}
            </Text>
            <Text style={styles.chipHint}>{hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Pages per answer</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            onPress={() => onChange({ maxPages: Math.max(1, settings.maxPages - 1) })}
            style={styles.stepBtn}
          >
            <Text style={styles.stepText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepVal}>{settings.maxPages}</Text>
          <TouchableOpacity
            onPress={() => onChange({ maxPages: Math.min(6, settings.maxPages + 1) })}
            style={styles.stepBtn}
          >
            <Text style={styles.stepText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.section}>Voice</Text>
      <Text style={styles.label}>Speaking voice</Text>
      <View style={styles.chips}>
        {(
          [
            ['device', 'Device', 'free, instant'],
            ['piper', 'Piper', 'natural, offline'],
            ['kitten', 'Kitten', '8 voices, offline'],
          ] as const
        ).map(([mode, label, hint]) => (
          <TouchableOpacity
            key={mode}
            style={[styles.chip, settings.ttsProvider === mode && styles.chipOn]}
            onPress={() => onChange({ ttsProvider: mode })}
          >
            <Text style={[styles.chipText, settings.ttsProvider === mode && styles.chipTextOn]}>
              {label}
            </Text>
            <Text style={styles.chipHint}>{hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Speaking speed</Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            onPress={() => onChange({ ttsSpeed: Math.max(0.5, +(settings.ttsSpeed - 0.1).toFixed(1)) })}
            style={styles.stepBtn}
          >
            <Text style={styles.stepText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepVal}>{settings.ttsSpeed.toFixed(1)}×</Text>
          <TouchableOpacity
            onPress={() => onChange({ ttsSpeed: Math.min(2, +(settings.ttsSpeed + 0.1).toFixed(1)) })}
            style={styles.stepBtn}
          >
            <Text style={styles.stepText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {settings.ttsProvider === 'device' && (
        <>
          <TouchableOpacity
            style={styles.testBtn}
            onPress={() => {
              stopAllSpeech();
              speakAloud(
                'Hello Amit. This is your assistant speaking.',
                undefined,
                msg => Alert.alert('Voice failed', msg),
              );
            }}
          >
            <Text style={styles.testText}>Test this voice</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            {ttsInfo === null
              ? 'Checking the phone voice engine…'
              : ttsInfo.ready
                ? `Engine: ${ttsInfo.engine || 'system default'} · ${ttsInfo.language}`
                : 'No usable voice data on this phone - install one below.'}
          </Text>

          <TouchableOpacity style={styles.ttsFix} onPress={openTtsSettings}>
            <Ionicons name="settings-outline" size={15} color={colors.textDim} />
            <Text style={styles.ttsFixText}>Phone text-to-speech settings</Text>
          </TouchableOpacity>
        </>
      )}

      {(settings.ttsProvider === 'piper' || settings.ttsProvider === 'kitten') && (
        <>
          <Text style={styles.hint}>
            {settings.ttsProvider === 'piper'
              ? 'Piper (Lessac) runs entirely on this phone — no network, no key.'
              : 'KittenTTS runs entirely on this phone — no network, no key.'}
          </Text>

          {settings.ttsProvider === 'kitten' && (
            <>
              <Text style={styles.label}>Voice</Text>
              <View style={styles.chips}>
                {KITTEN_VOICES.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.chip, settings.ttsVoice === v.id && styles.chipOn]}
                    onPress={() => onChange({ ttsVoice: v.id })}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        settings.ttsVoice === v.id && styles.chipTextOn,
                      ]}
                    >
                      {v.name}
                    </Text>
                    <Text style={styles.chipHint}>{v.note}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <TouchableOpacity
            style={styles.testBtn}
            onPress={() => {
              stopAllSpeech();
              speakAloud(
                'Hello Amit. This is your assistant speaking.',
                undefined,
                msg => Alert.alert('Voice failed', msg),
              );
            }}
          >
            <Text style={styles.testText}>Test this voice</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            First use takes a few seconds while the voice is unpacked from the app.
          </Text>
        </>
      )}

      <AssistantSection />

      <StorageSection />

      <Text style={styles.section}>Diagnostics</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Simulate 429 (quota demo)</Text>
        <TouchableOpacity
          onPress={() => onChange({ simulate429: !settings.simulate429 })}
          style={[styles.toggle, settings.simulate429 && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.simulate429 && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        On: no request leaves the phone. The app returns Google's real quota error so you can
        see the message and the ⛔ badge in the model picker on demand.
      </Text>
      <TouchableOpacity
        style={styles.resetBtn}
        onPress={() => {
          resetQuota();
          Alert.alert('Quota counters', 'Local usage counters and recorded limits cleared.');
        }}
      >
        <Text style={styles.resetText}>Reset quota counters</Text>
      </TouchableOpacity>

      <Text style={styles.section}>Persona</Text>
      <View style={styles.chips}>
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.id}
            style={[styles.chip, settings.systemPrompt === p.prompt && styles.chipOn]}
            onPress={() => onChange({ systemPrompt: p.prompt })}
          >
            <Text style={[styles.chipText, settings.systemPrompt === p.prompt && styles.chipTextOn]}>
              {p.emoji} {p.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>System prompt</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={settings.systemPrompt}
          onChangeText={t => onChange({ systemPrompt: t })}
          multiline
        />
        <Text style={styles.hint}>Sent as the system message on every request.</Text>
      </View>

      <Text style={styles.section}>This build</Text>
      <Text style={styles.about}>
        Native modules — STT: {hasSTT ? 'yes' : 'no'} · TTS: {hasTTS ? 'yes' : 'no'} · image picker:{' '}
        {hasPicker ? 'yes' : 'no'}
      </Text>

      <TouchableOpacity
        style={styles.dangerBtn}
        onPress={() =>
          Alert.alert('Delete all chats?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onClearChats },
          ])
        }
      >
        <Text style={styles.dangerText}>Delete all chats</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.resetBtn}
        onPress={() => onChange(DEFAULT_SETTINGS)}
      >
        <Text style={styles.resetText}>Reset settings to defaults</Text>
      </TouchableOpacity>

      <View style={{ height: space(12) }} />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    usageCard: { marginTop: space(3), backgroundColor: colors.bgRaised, borderRadius: radius.md, padding: space(3), gap: space(3) },
    mcpLine: { color: colors.text, fontFamily: mono, fontSize: 11 },
    usageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    usageLabel: { color: colors.textDim, fontSize: 13 },
    usageVal: { color: colors.text, fontFamily: mono, fontSize: 13, fontWeight: '600' },
    resetUsageBtn: { marginTop: space(3), paddingVertical: space(3), alignItems: 'center' },
    wrap: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space(4), maxWidth: 760, width: '100%', alignSelf: 'center', paddingBottom: space(20) },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space(3),
      paddingHorizontal: space(1),
      backgroundColor: colors.bg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: { color: colors.accent, fontSize: 15, width: 60 },
    headerTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
    section: {
      fontSize: 11,
      color: colors.accent,
      textTransform: 'uppercase',
      letterSpacing: 1.6,
      fontWeight: '700',
      marginTop: space(6),
      marginBottom: space(2.5),
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: space(4),
    },
    themeList: { gap: space(2.5), marginBottom: space(4) },
    themeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(3),
      backgroundColor: colors.bgRaised,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: space(3),
    },
    themeSwatch: {
      width: 38,
      height: 38,
      borderRadius: 19,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    themeAccentDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
    },
    themeName: { color: colors.text, fontSize: 15, fontWeight: '700' },
    themeDesc: { color: colors.textDim, fontSize: 11, marginTop: 2 },
    field: { marginBottom: space(4) },
    label: { color: colors.text, fontSize: 14, marginBottom: space(1.5) },
    input: {
      backgroundColor: colors.bgInput,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      paddingHorizontal: space(3.5),
      paddingVertical: space(3),
      fontSize: 16,
    },
    inputMulti: { minHeight: 96, textAlignVertical: 'top' },
    hint: { color: colors.textFaint, fontSize: 11, marginTop: space(1) },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginBottom: space(4) },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: space(3),
      paddingVertical: space(1.5),
    },
    chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
    chipText: { color: colors.textDim, fontSize: 12 },
    chipTextOn: { color: '#fff' },
    chipHint: { color: colors.textFaint, fontSize: 9, marginTop: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      marginBottom: space(3),
    },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
    stepBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.bgInput,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    stepText: { color: colors.text, fontSize: 16 },
    stepVal: { color: colors.text, fontFamily: mono, fontSize: 14, minWidth: 46, textAlign: 'center' },
    toggle: {
      width: 46,
      height: 27,
      borderRadius: radius.pill,
      backgroundColor: colors.bgInput,
      padding: 3,
      justifyContent: 'center',
    },
    toggleOn: { backgroundColor: colors.accent },
    knob: { width: 21, height: 21, borderRadius: 11, backgroundColor: colors.textDim },
    knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
    testBtn: {
      backgroundColor: colors.accentDim,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: space(3),
      alignItems: 'center',
    },
    testText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    ttsFix: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space(1.5),
      marginTop: space(3),
    },
    ttsFixText: { color: colors.textDim, fontSize: 12 },
    models: { marginTop: space(3), backgroundColor: colors.bgRaised, borderRadius: radius.md, padding: space(3) },
    modelsText: { color: colors.textDim, fontFamily: mono, fontSize: 11, lineHeight: 16 },
    about: { color: colors.textFaint, fontSize: 12, lineHeight: 18 },
    dangerBtn: {
      marginTop: space(6),
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: radius.md,
      paddingVertical: space(3),
      alignItems: 'center',
    },
    dangerText: { color: colors.danger, fontWeight: '600' },
    resetBtn: { marginTop: space(3), paddingVertical: space(3), alignItems: 'center' },
    resetText: { color: colors.textDim, fontSize: 13 },
  });
