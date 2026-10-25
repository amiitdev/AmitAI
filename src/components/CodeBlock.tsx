import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, mono, radius, space } from '../theme';
import { copyText } from '../lib/native';

/**
 * A code block with syntax colouring and its own copy button.
 *
 * No highlighter dependency: a small tokenizer handles the constructs that
 * actually appear in model output — comments, strings, numbers, keywords and
 * call sites. Unknown languages fall back to the generic keyword set, which is
 * safe because we never change the text, only its colour.
 */

type Token = { text: string; color: string; italic?: boolean };

const C = {
  plain: '#d7dae0',
  comment: '#5c6370',
  string: '#98c379',
  number: '#d19a66',
  keyword: '#c678dd',
  call: '#61afef',
  builtin: '#e5c07b',
  punct: '#8b93a1',
};

const KEYWORDS = [
  // python
  'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or',
  'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'lambda', 'yield', 'pass',
  'raise', 'global', 'nonlocal', 'assert', 'del', 'None', 'True', 'False', 'self',
  // js / ts
  'function', 'const', 'let', 'var', 'await', 'async', 'export', 'default', 'new', 'this',
  'typeof', 'instanceof', 'null', 'undefined', 'true', 'false', 'interface', 'type',
  'extends', 'implements', 'public', 'private', 'protected', 'static', 'readonly', 'enum',
  // c / java / kotlin / go / rust
  'void', 'int', 'long', 'float', 'double', 'char', 'bool', 'boolean', 'struct', 'union',
  'package', 'func', 'go', 'defer', 'select', 'case', 'switch', 'break', 'continue', 'map',
  'fn', 'impl', 'use', 'mut', 'pub', 'match', 'unsafe', 'where', 'trait', 'val',
  // shell
  'echo', 'then', 'fi', 'do', 'done', 'elif', 'esac', 'export', 'local', 'exit', 'cd',
  // sql
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'GROUP', 'ORDER', 'INSERT', 'UPDATE', 'DELETE',
  'CREATE', 'TABLE', 'INDEX', 'AND', 'OR', 'NOT', 'NULL',
];

const BUILTINS = [
  'print', 'len', 'range', 'str', 'int', 'list', 'dict', 'set', 'tuple', 'open', 'sum',
  'min', 'max', 'enumerate', 'zip', 'sorted', 'map', 'filter', 'console', 'require',
  'fetch', 'parseInt', 'JSON', 'Math', 'Object', 'Array', 'String', 'Promise', 'printf',
  'fmt', 'make', 'append', 'cap', 'copy', 'delete',
];

const KEYWORD_SET = new Set(KEYWORDS);
const BUILTIN_SET = new Set(BUILTINS);

/** One pass over the source. Groups are tried in order, first match wins. */
const TOKEN_RE = new RegExp(
  [
    '(\\/\\/[^\\n]*|#[^\\n]*|--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)', // 1 comment
    '("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)', // 2 string
    '\\b(\\d+\\.?\\d*[lLfFdDuU]?|0x[0-9a-fA-F]+)\\b', // 3 number
    '([A-Za-z_$][\\w$]*)(?=\\s*\\()', // 4 call / identifier before (
    '([A-Za-z_$][\\w$]*)', // 5 word
    '([{}()\\[\\];:,.<>=+\\-*/%!&|^~?]+)', // 6 punctuation
  ].join('|'),
  'g',
);

export function highlight(code: string): Token[] {
  const out: Token[] = [];
  const src = code.length > 20000 ? code.slice(0, 20000) : code;
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((m = TOKEN_RE.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), color: C.plain });
    const [text, comment, str, num, call, word, punct] = m;

    if (comment) out.push({ text, color: C.comment, italic: true });
    else if (str) out.push({ text, color: C.string });
    else if (num) out.push({ text, color: C.number });
    else if (call) out.push({ text, color: BUILTIN_SET.has(call) ? C.builtin : C.call });
    else if (word) {
      if (KEYWORD_SET.has(word)) out.push({ text, color: C.keyword });
      else if (BUILTIN_SET.has(word)) out.push({ text, color: C.builtin });
      else out.push({ text, color: C.plain });
    } else if (punct) out.push({ text, color: C.punct });

    last = m.index + text.length;
  }
  if (last < src.length) out.push({ text: src.slice(last), color: C.plain });
  return out;
}

export function CodeBlock({ lang, code, caret }: { lang: string; code: string; caret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const tokens = useMemo(() => highlight(code), [code]);

  const doCopy = async () => {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.lang}>{lang || 'code'}</Text>
        <TouchableOpacity onPress={doCopy} hitSlop={10} style={styles.copyBtn}>
          <Text style={[styles.copy, copied && styles.copyDone]}>
            {copied ? 'copied ✓' : 'copy'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollBody}
      >
        <Text style={styles.code} selectable>
          {tokens.map((t, i) => (
            <Text key={i} style={{ color: t.color, fontStyle: t.italic ? 'italic' : undefined }}>
              {t.text}
            </Text>
          ))}
          {caret ? <Text style={{ color: colors.accent }}>▍</Text> : null}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.code,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginVertical: space(2),
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space(3),
    paddingVertical: space(1.5),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#0a0a0f',
  },
  lang: { fontFamily: mono, fontSize: 11, color: colors.textFaint, letterSpacing: 0.5 },
  copyBtn: { paddingHorizontal: space(1) },
  copy: { color: colors.textDim, fontSize: 11 },
  copyDone: { color: colors.ok },
  scrollBody: { padding: space(3) },
  code: { fontFamily: mono, fontSize: 13, lineHeight: 20, color: C.plain },
});
