import { parseMemoryCommand } from '../src/lib/memoryCommands';

test('remember phrases are captured, filler stripped', () => {
  expect(parseMemoryCommand('remember my bike service will be in december')).toEqual({
    kind: 'remember',
    text: 'my bike service will be in december',
  });
  expect(parseMemoryCommand('Please remember that the Wi-Fi is JioFiber-5G.')).toEqual({
    kind: 'remember',
    text: 'the Wi-Fi is JioFiber-5G',
  });
  expect(parseMemoryCommand('  REMEMBER   my locker pin is 4417 ')).toEqual({
    kind: 'remember',
    text: 'my locker pin is 4417',
  });
});

test('recall phrases are recognised', () => {
  for (const q of [
    'what do you know about me',
    'What do you remember about me?',
    "what's in your memory",
    'list your notes',
    'show memory',
  ]) {
    expect(parseMemoryCommand(q)).toEqual({ kind: 'recall' });
  }
});

test('questions about the past are not treated as save commands', () => {
  expect(parseMemoryCommand('remember when we went to Goa?')).toBeNull();
  expect(parseMemoryCommand('remember how the router worked')).toBeNull();
});

test('normal chat is untouched', () => {
  expect(parseMemoryCommand('what is the weather in Nagpur')).toBeNull();
  expect(parseMemoryCommand('remember')).toBeNull();
  expect(parseMemoryCommand('')).toBeNull();
});
