import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetMemoryCache,
  addNote,
  clearNotes,
  deleteNote,
  formatNotes,
  loadNotes,
  searchNotes,
  updateNote,
} from '../src/lib/memory';

beforeEach(async () => {
  await AsyncStorage.clear();
  __resetMemoryCache();
});

test('a note survives a fresh load (cache cleared)', async () => {
  const note = await addNote('  My bike service is due in March.  ');
  expect(note.text).toBe('My bike service is due in March.');

  __resetMemoryCache();
  const list = await loadNotes();
  expect(list).toHaveLength(1);
  expect(list[0].text).toBe('My bike service is due in March.');
});

test('saving the same sentence twice updates instead of duplicating', async () => {
  const first = await addNote('Wifi is JioFiber-5G');
  const second = await addNote('wifi   is   jiofiber-5g');
  expect(second.id).toBe(first.id);

  const list = await loadNotes();
  expect(list).toHaveLength(1);
});

test('search ranks by how many words match', async () => {
  await addNote('Home wifi password lives in the router cupboard');
  await addNote('The car needs new wipers');
  await addNote('Office wifi SSID is AmitCorp');

  const wifi = await searchNotes('wifi');
  expect(wifi).toHaveLength(2);

  const precise = await searchNotes('office wifi');
  expect(precise[0].text).toContain('Office wifi');
});

test('an empty query returns the most recent notes first', async () => {
  await addNote('older note');
  const newest = await addNote('newest note');
  const recent = await searchNotes('');
  expect(recent[0].id).toBe(newest.id);
});

test('no match returns an empty list, not an error', async () => {
  await addNote('only this');
  expect(await searchNotes('spaceship')).toEqual([]);
});

test('update rewrites the text, delete removes one row', async () => {
  const a = await addNote('first');
  const b = await addNote('second');
  await updateNote(a.id, 'first, corrected');
  expect((await loadNotes()).map(n => n.text)).toEqual(['first, corrected', 'second']);

  expect(await deleteNote(b.id)).toBe(true);
  expect(await deleteNote('missing')).toBe(false);
  expect(await loadNotes()).toHaveLength(1);
});

test('clear wipes everything and formatting stays readable', async () => {
  const a = await addNote('alpha');
  await addNote('beta');
  const text = formatNotes(await loadNotes());
  expect(text).toContain('1. alpha');
  expect(text).toMatch(/alpha\s+\[.+\]/);

  await clearNotes();
  expect(await loadNotes()).toEqual([]);
  expect(formatNotes([])).toBe('');
  expect(a.id).toBeTruthy();
});
