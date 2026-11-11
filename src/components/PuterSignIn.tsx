import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useTheme, ThemeColors, radius, space } from '../theme';

/**
 * One-time Puter sign-in, inside the app.
 *
 * Puter's own login flow is a browser redirect: you open
 * `puter.com/?action=authme&redirectURL=...`, sign in, and Puter sends you back
 * to the redirect URL with `?token=<auth token>` — that is exactly how
 * `puter login` gets its token from a terminal.
 *
 * There is no server in this app to receive that redirect, so we point it at
 * loopback and intercept the navigation before the WebView tries to load it.
 * Android never actually requests the URL; we read the token out of it.
 *
 * If the intercept ever fails (Puter changes the flow, a provider refuses to
 * log in inside a WebView), the token field in Settings still takes a pasted
 * token, so this is a convenience, not a dependency.
 */

const CALLBACK_PORT = 8931;

const randomState = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Where Puter sends the token. Never actually loaded — we intercept it. */
const callbackUrl = (state: string) =>
  `http://127.0.0.1:${CALLBACK_PORT}/?state=${encodeURIComponent(state)}`;

const signInUrl = (callback: string) =>
  `https://puter.com/?action=authme&redirectURL=${encodeURIComponent(callback)}`;

/** Where the sheet opens. A standalone auth page, so nobody has to hunt for a
 *  "Sign in" button in a nav bar that is wider than a phone screen. */
const HOME_URL = 'https://puter.com/action/login';

/**
 * Watches for a Puter session and reports it once.
 *
 * `action=authme` only runs for a signed-in visitor: signed out, the GUI just
 * renders its homepage and the action never fires. So we sit on the page, wait
 * for the user to sign in (`window.auth_token` is what the GUI itself reads),
 * and only then navigate to the grant URL.
 *
 * Polled rather than checked once, because the GUI can switch to the desktop
 * without a page load.
 */
const WATCH_SESSION = `
(function () {
  if (window.__amitaiPuterWatch) return true;
  window.__amitaiPuterWatch = true;
  var reported = false;
  var tick = function () {
    var token = '';
    try { token = String(window.auth_token || ''); } catch (e) {}
    if (token && !reported) {
      reported = true;
      window.ReactNativeWebView.postMessage(JSON.stringify({ signedIn: true }));
      return;
    }
    setTimeout(tick, 1500);
  };
  tick();
})();
true;
`;

/** A fresh state + callback + auth URL for one attempt. */
function makeAuth(): { state: string; callback: string; url: string } {
  const state = randomState();
  const callback = callbackUrl(state);
  return { state, callback, url: signInUrl(callback) };
}

/** Pull `token=` out of a loopback redirect, or null if this is any other URL. */
export function tokenFromRedirect(url: string): string | null {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/i.test(url)) return null;
  const m = url.match(/[?&]token=([^&#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function PuterSignIn({
  visible,
  onClose,
  onToken,
}: {
  visible: boolean;
  onClose: () => void;
  onToken: (token: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // A fresh state + URL each time the sheet opens, so a stale page can never
  // hand back a token for a previous attempt.
  const [auth, setAuth] = useState(makeAuth);
  useEffect(() => {
    if (visible) {
      setAuth(makeAuth());
      granted.current = false;
    }
  }, [visible]);

  const webRef = useRef<any>(null);
  /** Set once we have sent the WebView to the grant URL, so the watcher that
   *  runs again on every page load cannot loop us back through it. */
  const granted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);

  /** true = let the navigation happen. */
  const takeToken = (target: string, block: boolean): boolean => {
    const token = tokenFromRedirect(target);
    if (!token) return !block;
    setProblem(null);
    onToken(token);
    onClose();
    return false;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.wrap, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Sign in to Puter</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>
          Create or open your free puter.com account below. Afterwards, approve
          the Puter dialog that asks to share an API token — that is the last
          step.
        </Text>

        {!!problem && <Text style={styles.problem}>{problem}</Text>}

        <TouchableOpacity
          style={styles.browserBtn}
          onPress={() =>
            Linking.openURL('https://puter.com/action/login').catch(() =>
              setProblem('No browser available. Type puter.com into Chrome yourself.'),
            )
          }
        >
          <Ionicons name="open-outline" size={14} color={colors.accent} />
          <Text style={styles.browserText}>
            Google / Microsoft / Apple sign-in needs a real browser — open in
            Chrome
          </Text>
        </TouchableOpacity>

        <View style={styles.web}>
          <WebView
            key={auth.state}
            ref={webRef}
            source={{ uri: HOME_URL }}
            javaScriptEnabled
            domStorageEnabled
            // Google's login needs its cookies inside this WebView.
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            startInLoadingState
            injectedJavaScript={WATCH_SESSION}
            onMessage={ev => {
              let signedIn = false;
              try {
                signedIn = !!JSON.parse(ev.nativeEvent.data).signedIn;
              } catch {}
              if (!signedIn || granted.current) return;
              // Signed in: ask for the grant. Puter shows its consent dialog,
              // then redirects to our loopback URL with ?token=…
              granted.current = true;
              setLoading(true);
              webRef.current?.injectJavaScript(
                `window.location.href = ${JSON.stringify(auth.url)}; true;`,
              );
            }}
            onShouldStartLoadWithRequest={req => takeToken(req.url, true)}
            onNavigationStateChange={nav => {
              if (!nav.loading) takeToken(nav.url, false);
            }}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setProblem(
                'The sign-in page did not load. Check the connection, or paste a token instead.',
              );
            }}
          />
          {loading && (
            <View style={styles.spinner} pointerEvents="none">
              <ActivityIndicator color={colors.accent} />
            </View>
          )}
        </View>

        <Text style={styles.footer}>
          Blank 127.0.0.1 page? That is the hand-off working — the sheet closes
          on its own. No dialog? Paste a token instead: puter.com → Settings →
          Developers → Create API Token.
        </Text>

        <TouchableOpacity
          style={[styles.done, { marginBottom: insets.bottom + space(3) }]}
          onPress={onClose}
        >
          <Text style={styles.doneText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space(4),
      paddingVertical: space(3),
    },
    title: { color: colors.text, fontSize: 17, fontWeight: '700' },
    note: {
      color: colors.textDim,
      fontSize: 13,
      lineHeight: 19,
      paddingHorizontal: space(4),
      paddingBottom: space(3),
    },
    problem: {
      color: colors.danger,
      fontSize: 13,
      paddingHorizontal: space(4),
      paddingBottom: space(2),
    },
    browserBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      marginHorizontal: space(4),
      marginBottom: space(3),
      paddingHorizontal: space(3),
      paddingVertical: space(2.5),
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgRaised,
    },
    browserText: { color: colors.textDim, fontSize: 11, flex: 1, lineHeight: 15 },
    web: { flex: 1, backgroundColor: colors.bgRaised },
    spinner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
    },
    footer: {
      color: colors.textFaint,
      fontSize: 11,
      lineHeight: 16,
      paddingHorizontal: space(4),
      paddingTop: space(3),
    },
    done: {
      marginHorizontal: space(4),
      marginTop: space(3),
      paddingVertical: space(3.5),
      borderRadius: radius.md,
      alignItems: 'center',
      backgroundColor: colors.bgInput,
    },
    doneText: { color: colors.textDim, fontSize: 15, fontWeight: '600' },
  });
