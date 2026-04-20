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

  it('produces the same anchor for duplicate headings (authoring constraint)', () => {
    // TOC and MDX h2/h3 renderers share a single slug helper. If authors
    // repeat a heading, both entries in the TOC resolve to the first h2 in
    // the DOM. Asserting this keeps the behavior deliberate, not accidental.
    const items = extractTableOfContents(`
## Overview

## Overview
`);

    expect(items.map((item) => item.anchor)).toEqual(['overview', 'overview']);
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
