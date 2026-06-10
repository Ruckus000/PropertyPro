import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaFrame, mediaKindFromSrc } from '@/components/help/media-frame';
import { sanitizeHelpHtml } from '@/lib/help/sanitize-help-html';

function renderSanitized(el: React.ReactElement): string {
  return sanitizeHelpHtml(renderToStaticMarkup(el));
}

describe('mediaKindFromSrc', () => {
  it('detects clips by extension', () => {
    expect(mediaKindFromSrc('/help/c/s/flow.mp4')).toBe('clip');
    expect(mediaKindFromSrc('/help/c/s/flow.webm')).toBe('clip');
    expect(mediaKindFromSrc('/help/c/s/shot.webp')).toBe('image');
    expect(mediaKindFromSrc('/help/c/s/shot.png')).toBe('image');
  });
});

describe('MediaFrame', () => {
  it('renders an image with lazy loading, dimensions, and zoom hook — surviving sanitization', () => {
    const out = renderSanitized(
      <MediaFrame src="/help/compliance/x/shot.webp" alt="Dashboard" width={1440} height={900} />,
    );
    expect(out).toContain('<img');
    expect(out).toContain('src="/help/compliance/x/shot.webp"');
    expect(out).toContain('width="1440"');
    expect(out).toContain('height="900"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('data-zoomable');
    expect(out).toContain('data-media-kind="image"');
    expect(out).not.toContain('style=');
  });

  it('emits a 2x srcset when src2x is provided', () => {
    const out = renderSanitized(
      <MediaFrame src="/h.webp" src2x="/h@2x.webp" alt="x" width={720} height={450} />,
    );
    expect(out).toContain('srcset="/h.webp 1x, /h@2x.webp 2x"');
  });

  it('renders a clip as muted looping video WITHOUT autoplay, with poster, play button, and GIF tag', () => {
    const out = renderSanitized(
      <MediaFrame
        src="/help/compliance/x/flow.mp4"
        poster="/help/compliance/x/flow-poster.webp"
        alt="Walkthrough"
        width={1440}
        height={900}
      />,
    );
    expect(out).toContain('<video');
    expect(out).not.toContain('autoplay');
    expect(out).toContain('muted');
    expect(out).toContain('loop');
    expect(out).toContain('playsinline');
    expect(out).toContain('poster="/help/compliance/x/flow-poster.webp"');
    expect(out).toContain('data-media-kind="clip"');
    expect(out).toContain('data-media-play');
    expect(out).toContain('GIF');
  });

  it('renders a caption in a figcaption', () => {
    const out = renderSanitized(
      <MediaFrame src="/h.webp" alt="x" width={720} height={450} caption="The gaps panel" />,
    );
    expect(out).toContain('<figcaption');
    expect(out).toContain('The gaps panel');
  });
});
