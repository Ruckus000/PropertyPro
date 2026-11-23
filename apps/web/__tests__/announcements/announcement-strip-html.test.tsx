/**
 * The announcement list previews a body as plain text. Bodies are sanitized
 * on write today, so this is defence in depth: turning HTML into text must
 * never build the markup inside the live document, where an `<img>` would
 * start loading (and its `onerror` fire) even though it is never attached.
 * A DOMParser document is inert: it runs no scripts and loads nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stripHtml } from '@/components/announcements/announcement-list';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stripHtml', () => {
  it('stripHtml never creates an element that can load', () => {
    const createElement = vi.spyOn(document, 'createElement');

    const text = stripHtml('<p>Pool <b>closed</b></p><img src="x" onerror="window.__fired=1">');

    expect(text).toBe('Pool closed');
    // No element is made in the live document at all — not the scratch <div>,
    // and so no <img> parsed inside it.
    expect(createElement).not.toHaveBeenCalled();
    expect((window as unknown as { __fired?: number }).__fired).toBeUndefined();
  });

  it('keeps the text of ordinary markup', () => {
    expect(stripHtml('<h2>Board meeting</h2><p>Tuesday &amp; Thursday</p>')).toBe(
      'Board meetingTuesday & Thursday',
    );
  });
});
