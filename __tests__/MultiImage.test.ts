import { Message } from '../src/types';
import { toWire } from '../src/api/openai';

const msg = (patch: Partial<Message>): Message => ({
  id: 'm1',
  role: 'user',
  content: '',
  createdAt: 1,
  ...patch,
});

describe('toWire — attachments', () => {
  test('one image becomes a text part plus one image part', () => {
    const wire = toWire(
      [msg({ content: 'what is this?', imageDatas: ['data:image/jpeg;base64,AAA'] })],
      '',
    );
    const parts = (wire[0] as any).content;
    expect(Array.isArray(parts)).toBe(true);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({ type: 'text', text: 'what is this?' });
    expect(parts[1].type).toBe('image_url');
    expect(parts[1].image_url.url).toBe('data:image/jpeg;base64,AAA');
  });

  test('eight images are all sent, in order', () => {
    const urls = Array.from({ length: 8 }, (_, i) => `data:image/jpeg;base64,IMG${i}`);
    const wire = toWire([msg({ content: 'compare', imageDatas: urls })], '');
    const parts = (wire[0] as any).content;
    expect(parts).toHaveLength(9);
    expect(parts.slice(1).map((p: any) => p.image_url.url)).toEqual(urls);
  });

  test('more than eight is capped, so one message cannot blow the context', () => {
    const urls = Array.from({ length: 12 }, (_, i) => `data:image/jpeg;base64,I${i}`);
    const wire = toWire([msg({ content: 'x', imageDatas: urls })], '');
    expect((wire[0] as any).content).toHaveLength(9);
  });

  test('an image with no caption still gets a text part', () => {
    const wire = toWire([msg({ imageDatas: ['data:image/png;base64,BBB'] })], '');
    expect((wire[0] as any).content[0].text).toBe('Describe these images.');
  });

  test('old single-image messages still work', () => {
    const wire = toWire([msg({ content: 'old', imageData: 'data:image/png;base64,OLD' })], '');
    expect((wire[0] as any).content[1].image_url.url).toBe('data:image/png;base64,OLD');
  });

  test('plain text stays a plain string (no needless arrays)', () => {
    const wire = toWire([msg({ content: 'hello' })], 'be brief');
    expect(wire[0]).toEqual({ role: 'system', content: 'be brief' });
    expect(wire[1]).toEqual({ role: 'user', content: 'hello' });
  });
});
