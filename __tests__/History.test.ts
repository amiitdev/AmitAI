import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildRecallPreamble, keywords, searchHistory } from '../src/lib/history';
import { saveConversations } from '../src/storage/store';
import { Conversation } from '../src/types';

const conv = (
  id: string,
  title: string,
  messages: { role: 'user' | 'assistant'; content: string; createdAt: number }[],
): Conversation => ({
  id,
  title,
  createdAt: messages[0]?.createdAt ?? 1,
  updatedAt: messages[messages.length - 1]?.createdAt ?? 1,
  messages: messages.map((m, i) => ({ id: `${id}-${i}`, ...m })),
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('keywords remove filler words', () => {
  expect(keywords('Do you remember my bike service?')).toEqual(['bike', 'service']);
});

test('an old chat is found from a new chat', async () => {
  await saveConversations([
    conv('c1', 'Bike service', [
      { role: 'user', content: 'remember my bike service will be in december', createdAt: 1000 },
      { role: 'assistant', content: 'Saved to memory: my bike service will be in December', createdAt: 2000 },
    ]),
    conv('c2', 'Docker notes', [
      { role: 'user', content: 'explain bridge networking in docker', createdAt: 3000 },
      { role: 'assistant', content: 'A bridge network is a private virtual switch.', createdAt: 4000 },
    ]),
  ]);

  const hits = await searchHistory('do you remember my bike service?');
  expect(hits.length).toBeGreaterThan(0);
  expect(hits[0].text).toMatch(/bike service/i);
});

test('the preamble carries the excerpt and a date', async () => {
  await saveConversations([
    conv('c1', 'Bike service', [
      { role: 'user', content: 'my bike service will be in december', createdAt: 1000 },
    ]),
  ]);
  const preamble = await buildRecallPreamble('when is my bike service due?');
  expect(preamble).toContain('my bike service will be in december');
  expect(preamble).toMatch(/Earlier conversations/);
  expect(preamble).toMatch(/\d/); // a date is present
});

test('memory notes are injected even when chats are not', async () => {
  const { addNote, __resetMemoryCache } = require('../src/lib/memory');
  __resetMemoryCache();
  await addNote('my bike service will be in December');
  const preamble = await buildRecallPreamble('when is my bike service due?');
  expect(preamble).toContain('my bike service will be in December');
  expect(preamble).toMatch(/saved in memory/);
});

test('unrelated questions get no preamble', async () => {
  await saveConversations([
    conv('c1', 'Bike service', [
      { role: 'user', content: 'my bike service will be in december', createdAt: 1000 },
    ]),
  ]);
  expect(await buildRecallPreamble('what is the weather in Tokyo')).toBe('');
});
