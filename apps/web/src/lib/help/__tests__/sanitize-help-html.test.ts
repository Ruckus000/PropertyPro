import { describe, expect, it } from 'vitest';
import { sanitizeAuthoredHtml } from '../../utils/sanitize-authored-html';
import { sanitizeHelpHtml } from '../sanitize-help-html';

describe('sanitizeHelpHtml', () => {
  it('keeps help article structure and classes while stripping executable surfaces', () => {
    const html = sanitizeHelpHtml(
      '<h2 id="intro" class="text-content" onclick="alert(1)">Intro</h2>' +
        '<script>alert(1)</script>' +
        '<p class="mt-4">Safe copy</p>',
    );

    expect(html).toContain('id="intro"');
    expect(html).toContain('class="text-content"');
    expect(html).toContain('Safe copy');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
  });

  it('does not inherit authored-document class filtering hooks', () => {
    expect(sanitizeAuthoredHtml('<p class="editor-link text-content">Authored</p>')).toContain(
      'class="editor-link"',
    );

    const html = sanitizeHelpHtml('<p class="text-content mt-4">Help copy</p>');

    expect(html).toContain('class="text-content mt-4"');
  });
});
