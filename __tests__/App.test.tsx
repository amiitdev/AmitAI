/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(<App />);
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  });
  // Unmount so the splash timers and animations are cancelled — otherwise they
  // fire after Jest has torn the environment down.
  await ReactTestRenderer.act(async () => {
    tree?.unmount();
  });
});
