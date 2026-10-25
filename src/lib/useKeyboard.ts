import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Keyboard height in dp, 0 when hidden.
 *
 * Why this exists: from Android 15 (API 35) the platform enforces edge-to-edge
 * for apps targeting 35+, and `windowSoftInputMode="adjustResize"` stops
 * resizing the window. React Native does not translate the IME insets for you,
 * so anything anchored to the bottom of the screen ends up under the keyboard.
 * We subscribe to the keyboard events and pad the container ourselves.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // 'will' events fire too early on Android to be useful; 'did' is accurate.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, e => {
      setHeight(Math.round(e.endCoordinates.height));
    });
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
