import { Conversation } from '../types';
import { loadConversations } from '../storage/store';
import { searchNotes } from './memory';

/**
 * Search past conversations.
 *
 * Chats live in AsyncStorage or the SD-card backend; loadConversations() reads
 * both, so this file only ranks. Two consumers: the `search_chats` tool, and a
 * context preamble injected before each answer for providers that drop tools
 * (the phone-local bridge does exactly that — verified on device).
 */

const STOP = new Set([
  'the', 'and', 'for', 'you', 'your', 'was', 'were', 'are', 'is', 'am', 'did',
  'does', 'do', 'what', 'when', 'where', 'who', 'why', 'how', 'about', 'tell',
  'said', 'say', 'me', 'my', 'we', 'our', 'i', 'a', 'an', 'of', 'to', 'in',
  'on', 'at', 'it', 'this', 'that', 'with', 'from', 'remember', 'recall',
  'know', 'any', 'anything', 'something', 'please', 'can', 'could', 'would',
  'should', 'has', 'have', 'had', 'be', 'been', 'there', 'then', 'not',
]);

export function keywords(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9@._-]+/)
        .map(w => w.replace(/^[-_.]+|[-_.]+$/g, ''))
        .filter(w => w.length > 1 && !STOP.has(w)),
    ),
  ];
}

export interface HistoryHit {
  conversationId: string;
  title: string;
  role: 'user' | 'assistant';
  date: number;
  text: string;
  score: number;
}

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Rank messages across every conversation by keyword overlap. */
export function rankHistory(
  conversations: Conversation[],
  query: string,
  opts: { excludeConversationId?: string; limit?: number; maxPerChat?: number } = {},
): HistoryHit[] {
  const words = keywords(query);
  if (!words.length) return [];
  const limit = opts.limit ?? 6;
  const maxPerChat = opts.maxPerChat ?? 2;

  const hits: HistoryHit[] = [];
  for (const c of conversations) {
    const perChat: HistoryHit[] = [];
    for (const m of c.messages) {
      if (m.role !== 'user' && m.role !== 'assistant') continue;
      if (!m.content.trim() || m.content.length < 6) continue;
      const hay = fold(m.content);
      let score = 0;
      for (const w of words) {
        const f = fold(w);
        if (hay.includes(f)) score += w.length > 4 ? 2 : 1;
      }
      if (!score) continue;
      perChat.push({
        conversationId: c.id,
        title: c.title,
        role: m.role,
        date: m.createdAt,
        text: m.content,
        score: score / Math.sqrt(m.content.length / 120),
      });
    }
    perChat.sort((a, b) => b.score - a.score);
    hits.push(...perChat.slice(0, maxPerChat));
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Load every stored chat (AsyncStorage or SD card) and rank it. */
export async function searchHistory(
  query: string,
  opts: { excludeConversationId?: string; limit?: number; maxPerChat?: number } = {},
): Promise<HistoryHit[]> {
  const conversations = await loadConversations();
  if (!conversations.length) return [];
  return rankHistory(conversations, query, opts);
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Context appended to the system prompt before a request.
 *
 * This is what makes "do you remember my bike service?" work on a provider
 * that never sends tool calls: the relevant excerpts are already in front of
 * the model, retrieved locally from the phone's own chat store.
 */
export async function buildRecallPreamble(
  query: string,
  activeId?: string,
): Promise<string> {
  const words = keywords(query);
  if (!words.length) return '';

  const [hits, notes] = await Promise.all([
    searchHistory(query, { excludeConversationId: activeId, limit: 4, maxPerChat: 1 }),
    searchNotes(query, 5),
  ]);

  const q = fold(query);
  const usefulHits = hits.filter(h => fold(h.text) !== q);

  const blocks: string[] = [];
  if (notes.length) {
    blocks.push(
      'Facts the user saved in memory on this phone:\n' +
        notes.map(n => `- ${oneLine(n.text)}`).join('\n'),
    );
  }
  if (usefulHits.length) {
    blocks.push(
      'Earlier conversations on this phone that matched:\n' +
        usefulHits
          .map(
            h =>
              `- (${new Date(h.date).toLocaleDateString()}) ${
                h.role === 'user' ? 'Amit' : 'you'
              }: ${oneLine(h.text).slice(0, 320)}`,
          )
          .join('\n'),
    );
  }
  if (!blocks.length) return '';

  return [
    ...blocks,
    'Use this context when it answers the question, and mention the date.',
    'These are real records on the phone — never say you have no memory.',
  ].join('\n\n');
}


