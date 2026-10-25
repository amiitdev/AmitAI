import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ReadRequest, completeRead, failRead, onReaderNeeded, pendingRead } from '../lib/reader';

/**
 * Offscreen browser used for pages that only exist after JavaScript runs
 * (product pages, SPAs, price widgets). Visible pages go through the fast
 * fetch+strip path in src/api/tools.ts instead — this is the fallback.
 *
 * It is deliberately 1x1 and transparent: the user never sees it, and it is
 * torn down as soon as one extraction finishes.
 */

const EXTRACT = `
(function () {
  try {
    var t = document.body ? document.body.innerText : '';
    t = t.replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 6000);
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, text: t }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, text: String(e) }));
  }
})();
true;
`;

export function WebReader() {
  const [request, setRequest] = useState<ReadRequest | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => onReaderNeeded(() => setRequest(pendingRead())), []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!request) return null;

  const finish = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    completeRead(request.id, text);
    setRequest(null);
  };

  const fail = (msg: string) => {
    if (timer.current) clearTimeout(timer.current);
    failRead(request.id, msg);
    setRequest(null);
  };

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        key={request.id}
        source={{ uri: request.url }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        // Give lazy content a moment after onLoadEnd before grabbing the text.
        onLoadEnd={() => {
          timer.current = setTimeout(() => {
            // no-op: extraction is triggered below via injectJavaScript
          }, 0);
        }}
        onLoadProgress={e => {
          if (e.nativeEvent.progress >= 0.9 && !timer.current) {
            timer.current = setTimeout(() => {
              // handled after mount by the effect-free path below
            }, 1200);
          }
        }}
        injectedJavaScript={EXTRACT}
        onMessage={ev => {
          try {
            const data = JSON.parse(ev.nativeEvent.data);
            if (data.ok && data.text) finish(data.text);
            else fail(data.text || 'Could not read page');
          } catch {
            fail('Could not read page');
          }
        }}
        onError={() => fail('Could not load page')}
        onHttpError={e => fail(`HTTP ${e.nativeEvent.statusCode}`)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
  web: { width: 1, height: 1 },
});
