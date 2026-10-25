module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?(?:@?react-native|@react-native-community|@react-native-async-storage|react-native-safe-area-context|react-native-image-picker))',
  ],
};
