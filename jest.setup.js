/* Jest setup: replace native-backed modules with in-memory fakes. */

jest.mock('@react-native-async-storage/async-storage', () => {
  var mem = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(function (k) {
        return Promise.resolve(mem.has(k) ? mem.get(k) : null);
      }),
      setItem: jest.fn(function (k, v) {
        mem.set(k, v);
        return Promise.resolve();
      }),
      removeItem: jest.fn(function (k) {
        mem.delete(k);
        return Promise.resolve();
      }),
      clear: jest.fn(function () {
        mem.clear();
        return Promise.resolve();
      }),
      getAllKeys: jest.fn(function () {
        return Promise.resolve(Array.from(mem.keys()));
      }),
    },
  };
});

jest.mock('react-native-safe-area-context', function () {
  var inset = { top: 0, right: 0, bottom: 0, left: 0 };
  var frame = { x: 0, y: 0, width: 390, height: 844 };
  return {
    SafeAreaProvider: function (props) {
      return props.children;
    },
    SafeAreaConsumer: function (props) {
      return props.children(inset);
    },
    SafeAreaView: function (props) {
      return props.children;
    },
    useSafeAreaInsets: function () {
      return inset;
    },
    useSafeAreaFrame: function () {
      return frame;
    },
    initialWindowMetrics: { insets: inset, frame: frame },
  };
});

// The Kotlin voice bridge does not exist under Jest — which is exactly the case
// the JS guards (hasSTT / hasTTS) are written for.
jest.mock('react-native-image-picker', function () {
  return { launchImageLibrary: jest.fn() };
});

// Native-only UI packages: render nothing under Jest.
jest.mock('react-native-webview', function () {
  var React = require('react');
  return { WebView: function () { return null; } };
});

jest.mock('@react-native-vector-icons/ionicons', function () {
  var React = require('react');
  return { __esModule: true, default: function () { return null; } };
});
