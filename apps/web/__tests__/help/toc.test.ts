import { describe, expect, it } from 'vitest';
import { extractTableOfContents } from '../../src/lib/help/toc';

describe('extractTableOfContents', () => {
  it('captures h2 and h3 headings', () => {
    const items = extractTableOfContents(`
# Top-level (ignored)

## First section

Paragraph.

### Nested note

## Second section
`);

    expect(items).toEqual([
      { depth: 2, label: 'First section', anchor: 'first-section' },
      { depth: 3, label: 'Nested note', anchor: 'nested-note' },
      { depth: 2, label: 'Second section', anchor: 'second-section' },
    ]);
  });

  it('deduplicates anchors with a suffix', () => {
    const items = extractTableOfContents(`
## Overview

## Overview
`);

    expect(items.map((item) => item.anchor)).toEqual(['overview', 'overview-2']);
  });

  it('skips headings that appear inside fenced code blocks', () => {
    const items = extractTableOfContents(`
## Real heading

\`\`\`
## Fake heading (in a fence)
\`\`\`

## Another real heading
`);

    expect(items.map((item) => item.label)).toEqual([
      'Real heading',
      'Another real heading',
    ]);
  });

  it('returns an empty list when there are no h2/h3 headings', () => {
    expect(extractTableOfContents('# Just an h1\n\nBody text.')).toEqual([]);
  });
});
