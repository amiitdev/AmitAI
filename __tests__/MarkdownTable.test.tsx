/**
 * Markdown tables: models answer "compare X and Y" with a GFM table, so it has
 * to survive parsing and render as real cells instead of raw pipes.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

import { Markdown, parseMarkdown } from '../src/components/Markdown';

const TABLE = [
  '| Feature | TCP | UDP |',
  '| --- | :---: | ---: |',
  '| Connection | yes | no |',
  '| Speed | slower | **faster** |',
  '| Use case | `http` | dns |',
].join('\n');

const allText = (tree: ReactTestRenderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map(n => React.Children.toArray(n.props.children).map(c => (typeof c === 'string' ? c : '')).join(''))
    .join(' | ');

describe('Markdown · table parsing', () => {
  test('a header + delimiter row becomes a table block', () => {
    const blocks = parseMarkdown(TABLE);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'table',
      header: ['Feature', 'TCP', 'UDP'],
      rows: [
        ['Connection', 'yes', 'no'],
        ['Speed', 'slower', '**faster**'],
        ['Use case', '`http`', 'dns'],
      ],
    });
  });

  test('column alignment comes from the delimiter row', () => {
    const blocks = parseMarkdown(TABLE);
    expect(blocks[0]).toMatchObject({ align: ['left', 'center', 'right'] });
  });

  test('ragged rows are normalised to the header width', () => {
    const blocks = parseMarkdown('| a | b |\n|---|---|\n| 1 |\n| 2 | 3 | 4 |');
    const table = blocks[0] as any;
    expect(table.rows).toEqual([
      ['1', ''],
      ['2', '3'],
    ]);
  });

  test('a table with no outer pipes still parses', () => {
    const blocks = parseMarkdown('a | b\n--- | ---\n1 | 2');
    expect(blocks[0]).toMatchObject({ kind: 'table', header: ['a', 'b'] });
  });

  test('prose containing a pipe is not a table', () => {
    const blocks = parseMarkdown('Use the pipe | operator in bash.\n\nNext paragraph.');
    expect(blocks.map(b => b.kind)).toEqual(['para', 'para']);
  });

  test('a table straight after a paragraph is not swallowed by it', () => {
    const blocks = parseMarkdown('Here is the comparison:\n| a | b |\n|---|---|\n| 1 | 2 |');
    expect(blocks.map(b => b.kind)).toEqual(['para', 'table']);
  });
});

describe('Markdown · table rendering', () => {
  test('renders header and every cell', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Markdown source={TABLE} />);
    });
    const text = allText(tree);
    ['Feature', 'TCP', 'UDP', 'Connection', 'slower', 'dns'].forEach(s => {
      expect(text).toContain(s);
    });
    // the raw delimiter row must never reach the screen
    expect(text).not.toContain('---');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('inline formatting inside cells still works', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Markdown source={TABLE} />);
    });
    // "**faster**" is bolded in a cell and "`http`" is inline code — neither
    // should show its markup characters.
    const text = allText(tree);
    expect(text).toContain('faster');
    expect(text).toContain('http');
    expect(text).not.toContain('**');
    expect(text).not.toContain('`');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('tables and surrounding markdown coexist', async () => {
    const doc = `## Comparison\n\n${TABLE}\n\nBoth work.`;
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Markdown source={doc} />);
    });
    const text = allText(tree);
    expect(text).toContain('Comparison');
    expect(text).toContain('Both work');
    expect(text).toContain('Speed');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('three columns stack each row instead of squeezing into slivers', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Markdown source={TABLE} />);
    });
    const occurrences = (hay: string, needle: string) => hay.split(needle).length - 1;
    const text = allText(tree);
    // In a grid each column header is printed once; stacked, every header
    // repeats as the key of each row — one per data row here.
    expect(occurrences(text, 'TCP')).toBe(3);
    expect(occurrences(text, 'UDP')).toBe(3);
    // The first column's header survives as the caption above the stack.
    expect(text).toContain('Feature');
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('two columns keep the side-by-side grid', async () => {
    const doc = '| Key | Value |\n| --- | --- |\n| colour | indigo |';
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Markdown source={doc} />);
    });
    const text = allText(tree);
    expect(text.split('Key').length - 1).toBe(1);
    expect(text).toContain('indigo');
    await ReactTestRenderer.act(async () => tree.unmount());
  });
});
