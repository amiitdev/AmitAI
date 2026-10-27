import React from 'react';
import { View, Text, StyleSheet, Linking, Platform, ScrollView } from 'react-native';
import { colors, mono, radius, space } from '../theme';
import { CodeBlock } from './CodeBlock';

/**
 * Minimal markdown renderer — no external deps, no WebView.
 *
 * Deliberately supports only what models actually emit: fenced code,
 * headings, bullet/numbered lists, quotes, tables, bold/italic/inline-code,
 * links. Anything else passes through as plain text rather than being mangled.
 */

type Align = 'left' | 'center' | 'right';

type Block =
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'bullet'; items: string[] }
  | { kind: 'number'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][]; align: Align[] }
  | { kind: 'hr' }
  | { kind: 'para'; text: string };

/** `| a | b |` → ['a', 'b']; honours `\|` as a literal pipe inside a cell. */
function splitRow(line: string): string[] {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const out: string[] = [];
  let buf = '';
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '\\' && s[k + 1] === '|') {
      buf += '|';
      k++;
      continue;
    }
    if (ch === '|') {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf.trim());
  return out;
}

/** GFM delimiter row: |---|:--:|---:| */
const isDelimiterRow = (line: string): boolean =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

const alignmentOf = (cell: string): Align => {
  const l = cell.startsWith(':');
  const r = cell.endsWith(':');
  return l && r ? 'center' : r ? 'right' : 'left';
};

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      const lang = fence[1] || '';
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push({ kind: 'code', lang, text: buf.join('\n') });
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ kind: 'heading', level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    // table: a header row followed by a delimiter row
    if (line.includes('|') && i + 1 < lines.length && isDelimiterRow(lines[i + 1])) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map(alignmentOf);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      // normalise every row to the header width so rendering stays aligned
      const width = header.length;
      blocks.push({
        kind: 'table',
        header,
        rows: rows.map(r => Array.from({ length: width }, (_, c) => r[c] ?? '')),
        align: Array.from({ length: width }, (_, c) => align[c] ?? 'left'),
      });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', text: buf.join(' ') });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'bullet', items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'number', items });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // paragraph: gather until a blank line or a block starter
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|#{1,4}\s|[-*+]\s|\d+[.)]\s|>|---|\|)/.test(lines[i])
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    // Single newlines are soft breaks in markdown; collapsing them also lets
    // **bold** spans survive a model that wraps mid-phrase.
    blocks.push({ kind: 'para', text: buf.join(' ') });
  }

  return blocks;
}

/**
 * Inline tokens, most specific first.
 *
 * The old pattern refused any `*` inside a bold span, so `**2*3 = 6**` (and
 * anything else containing an asterisk, including nested italics) fell through
 * as literal text with the stars still visible. Bare `__bold__` and `_italic_`
 * were not recognised at all.
 */
const INLINE =
  /(`[^`\n]+`|\*\*\*(?:[^*\n]|\*(?!\*))+\*\*\*|\*\*(?:[^*\n]|\*(?!\*))+\*\*|__[^_\n]+__|\*(?!\*)[^*\n]+\*|_(?!_)[^_\n]+_|\[[^\]\n]+\]\([^)\s]+\))/g;

function Inline({ text, base }: { text: string; base?: any }) {
  const parts = text.split(INLINE).filter(p => p !== '');
  return (
    <Text style={[styles.body, base]}>
      {parts.map((p, idx) => {
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <Text key={idx} style={styles.inlineCode}>
              {p.slice(1, -1)}
            </Text>
          );
        }
        if (p.startsWith('***') && p.endsWith('***') && p.length > 6) {
          return (
            <Text key={idx} style={[styles.bold, styles.italic]}>
              {p.slice(3, -3)}
            </Text>
          );
        }
        if ((p.startsWith('**') && p.endsWith('**')) || (p.startsWith('__') && p.endsWith('__'))) {
          return (
            <Text key={idx} style={styles.bold}>
              {p.slice(2, -2)}
            </Text>
          );
        }
        if (p.length > 2 && ((p.startsWith('*') && p.endsWith('*')) || (p.startsWith('_') && p.endsWith('_')))) {
          return (
            <Text key={idx} style={styles.italic}>
              {p.slice(1, -1)}
            </Text>
          );
        }
        const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (link) {
          return (
            <Text key={idx} style={styles.link} onPress={() => Linking.openURL(link[2]).catch(() => {})}>
              {link[1]}
            </Text>
          );
        }
        return <Text key={idx}>{p}</Text>;
      })}
    </Text>
  );
}

export function Markdown({ source, caret }: { source: string; caret?: boolean }) {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);

  return (
    <View>
      {blocks.map((b, idx) => {
        const last = idx === blocks.length - 1;
        switch (b.kind) {
          case 'code':
            return <CodeBlock key={idx} lang={b.lang} code={b.text} caret={caret && last} />;
          case 'heading': {
            const size = [0, 22, 19, 17, 16][b.level] || 16;
            return (
              <Text key={idx} style={[styles.heading, { fontSize: size }]}>
                <Inline text={b.text} base={{ fontWeight: '700' }} />
                {caret && last ? <Text style={styles.caret}>▍</Text> : null}
              </Text>
            );
          }
          case 'bullet':
          case 'number':
            return (
              <View key={idx} style={styles.list}>
                {b.items.map((it, j) => (
                  <View key={j} style={styles.listRow}>
                    <Text style={styles.listMark}>{b.kind === 'bullet' ? '•' : `${j + 1}.`}</Text>
                    <Inline text={it} base={styles.listText} />
                  </View>
                ))}
              </View>
            );
          case 'quote':
            return (
              <View key={idx} style={styles.quote}>
                <Inline text={b.text} base={styles.quoteText} />
              </View>
            );
          case 'table':
            return <Table key={idx} header={b.header} rows={b.rows} align={b.align} />;
          case 'hr':
            return <View key={idx} style={styles.hr} />;
          default:
            return (
              <Text key={idx} style={styles.body}>
                <Inline text={b.text} />
                {caret && last ? <Text style={styles.caret}>▍</Text> : null}
              </Text>
            );
        }
      })}
    </View>
  );
}

/**
 * Tables scroll horizontally instead of squeezing: comparison answers are
 * usually 3+ columns and wrapping them into slivers is worse than scrolling.
 */
function Table({
  header,
  rows,
  align,
}: {
  header: string[];
  rows: string[][];
  align: Align[];
}) {
  /**
   * Column widths are sized from content, then clamped. The cap matters: models
   * happily put whole sentences in a cell, and an unclamped 240dp column meant a
   * three-column table showed barely one column per screen.
   */
  const widths = React.useMemo(
    () =>
      header.map((h, c) => {
        const longest = Math.max(h.length, ...rows.map(r => (r[c] ?? '').length));
        return Math.min(148, Math.max(74, Math.round(longest * 6.4) + 22));
      }),
    [header, rows],
  );

  const cellStyle = (c: number, isHead: boolean) => [
    styles.td,
    { width: widths[c] },
    c < header.length - 1 && styles.tdDivider,
    isHead ? styles.th : null,
  ];

  return (
    <View style={styles.tableWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={styles.tableRow}>
            {header.map((cell, c) => (
              <View key={c} style={cellStyle(c, true)}>
                <Inline
                  text={cell}
                  base={[styles.thText, { textAlign: align[c] ?? 'left' }]}
                />
              </View>
            ))}
          </View>
          {rows.map((row, r) => (
            <View
              key={r}
              style={[styles.tableRow, r % 2 === 1 && styles.tableRowAlt]}
            >
              {row.map((cell, c) => (
                <View key={c} style={cellStyle(c, false)}>
                  <Inline
                    text={cell}
                    base={[styles.tdText, { textAlign: align[c] ?? 'left' }]}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: 16, lineHeight: 24 },
  tableWrap: {
    marginVertical: space(2.5),
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tableRow: { flexDirection: 'row', alignItems: 'stretch' },
  tableRowAlt: { backgroundColor: colors.bgRaised },
  td: { paddingHorizontal: space(2), paddingVertical: space(1.75), justifyContent: 'center' },
  tdDivider: { borderRightWidth: 1, borderRightColor: colors.border },
  th: { backgroundColor: colors.bgInput, borderBottomWidth: 1, borderBottomColor: colors.border },
  thText: { color: colors.text, fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  tdText: { color: colors.textDim, fontSize: 12.5, lineHeight: 17 },
  heading: { color: colors.text, fontWeight: '700', marginTop: space(3), marginBottom: space(1.5) },
  bold: { fontWeight: '700', color: '#fff' },
  italic: { fontStyle: 'italic' },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  caret: { color: colors.accent },
  inlineCode: {
    fontFamily: mono,
    fontSize: 14,
    color: '#e6d9ff',
    backgroundColor: colors.bgInput,
  },
  codeWrap: {
    backgroundColor: colors.code,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginVertical: space(2),
    overflow: 'hidden',
  },
  codeHead: {
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#0c0c11',
  },
  codeLang: { fontFamily: mono, fontSize: 11, color: colors.textFaint, letterSpacing: 0.5 },
  codeText: {
    fontFamily: mono,
    fontSize: 13,
    lineHeight: 20,
    color: '#d7dae0',
    padding: space(3),
    ...Platform.select({ android: { includeFontPadding: false } }),
  },
  list: { marginVertical: space(1) },
  listRow: { flexDirection: 'row', marginBottom: space(1) },
  listMark: { color: colors.textDim, width: 20, fontSize: 16, lineHeight: 24 },
  listText: { flex: 1 },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accentDim,
    paddingLeft: space(3),
    marginVertical: space(2),
  },
  quoteText: { color: colors.textDim, fontStyle: 'italic' },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: space(3) },
});
