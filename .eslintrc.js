module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Jest globals (describe/test/expect/jest) only exist in test files and
      // the setup file, so they are declared there instead of globally.
      files: ['__tests__/**/*.{js,jsx,ts,tsx}', 'jest.setup.js'],
      env: { jest: true },
    },
  ],
};
