/**
 * Markdown → readable plain text, for places that cannot render rich text
 * (the voice-mode transcript, spoken text, notification bodies).
 *
 * Structure is preserved: list items and table rows keep their own line, so a
 * five-phone answer reads as five paragraphs instead of one wall of words.
 */
export function plainMarkdown(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, '\n code \n')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*(\d+)[.)]\s+/gm, '$1. ')
    // table separator rows (|---|:--:|) carry no meaning when spoken
    .replace(/^\s*\|?[\s:|-]{4,}\|?\s*$/gm, '')
    // table rows become "a · b · c" on their own line
    .replace(/^\s*\|(.*)\|\s*$/gm, (_m, row: string) =>
      row
        .split('|')
        .map(c => c.trim())
        .filter(Boolean)
        .join(' · '),
    )
    .replace(/\|/g, ' ')
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)([^*_\n]+)\1/g, '$2')
    .replace(/\*{2,}/g, '')
    .replace(/_{2,}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n· /g, '\n')
    .trim();
}

/**
 * How many words of `text` are spoken at `fraction` of the utterance.
 *
 * Words are counted the way the transcript renders them (split on whitespace),
 * so the highlight advances exactly one word at a time as the audio plays.
 */
export function spokenWordIndex(text: string, fraction: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const f = Math.max(0, Math.min(1, fraction));
  return Math.min(words.length, Math.floor(f * words.length));
}
