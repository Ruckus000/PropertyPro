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

describe('media markup survival (MediaFrame contract)', () => {
  it('keeps <video> with playback attributes and poster', () => {
    const html =
      '<video muted loop playsinline preload="metadata" poster="/help/c/s/poster.webp" width="1440" height="900" data-zoomable data-media-kind="clip"><source src="/help/c/s/clip.mp4" type="video/mp4"></source></video>';
    const out = sanitizeHelpHtml(html);
    expect(out).toContain('<video');
    expect(out).toContain('muted');
    expect(out).toContain('loop');
    expect(out).toContain('playsinline');
    expect(out).toContain('poster="/help/c/s/poster.webp"');
    expect(out).toContain('<source');
    expect(out).toContain('data-zoomable');
    expect(out).toContain('data-media-kind="clip"');
  });

  it('never lets autoplay through MediaFrame markup by construction, but DOES allow the attribute (documents default)', () => {
    // We rely on MediaFrame to omit autoplay; the sanitizer would pass it.
    // This test documents that the enhancer — not the sanitizer — owns playback.
    const out = sanitizeHelpHtml('<video autoplay muted></video>');
    expect(out).toContain('autoplay');
  });

  it('keeps img srcset/loading/decoding/width/height and data-zoomable', () => {
    const html =
      '<img src="/help/c/s/shot.webp" srcset="/help/c/s/shot.webp 1x, /help/c/s/shot@2x.webp 2x" alt="x" loading="lazy" decoding="async" width="1440" height="900" data-zoomable data-media-kind="image">';
    const out = sanitizeHelpHtml(html);
    expect(out).toContain('srcset=');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('width="1440"');
    expect(out).toContain('data-zoomable');
  });

  it('keeps <button data-media-play> (reduced-motion play affordance)', () => {
    const out = sanitizeHelpHtml('<button type="button" data-media-play aria-label="Play">p</button>');
    expect(out).toContain('data-media-play');
  });

  it('strips inline style attributes — components must not rely on them', () => {
    const out = sanitizeHelpHtml('<img src="/x.webp" style="aspect-ratio: 16/9" alt="">');
    expect(out).not.toContain('style=');
  });
});
