/**
 * Website editor v3, Phase 7 — urgent notice pure logic.
 *
 * Two things are load-bearing here and both are tested exhaustively:
 *
 *  - `normalizeUrgentNoticeText` is the server-side half of the 240-character
 *    cap. `maxLength` on a textarea stops an honest typist, not a crafted
 *    request, so the cap has to survive input the browser never produced.
 *  - `isUrgentNoticeActive` is compared at RENDER time on every public
 *    pageview. It is the reason a missed cron cannot strand a live banner, so
 *    its boundary behaviour is a correctness requirement, not a detail.
 */
import { describe, it, expect } from 'vitest';
import {
  URGENT_NOTICE_MAX_LENGTH,
  isUrgentNoticeActive,
  normalizeUrgentNoticeText,
} from '@/lib/site-editor/urgent-notice';

const NOW = new Date('2026-07-27T12:00:00.000Z');

describe('URGENT_NOTICE_MAX_LENGTH', () => {
  it('is 240, the cap named in the phase spec', () => {
    expect(URGENT_NOTICE_MAX_LENGTH).toBe(240);
  });
});

describe('normalizeUrgentNoticeText', () => {
  it('returns trimmed text unchanged when it is within the cap', () => {
    expect(normalizeUrgentNoticeText('  Pool closed until Monday.  ')).toBe(
      'Pool closed until Monday.',
    );
  });

  it('collapses newlines and runs of whitespace to single spaces', () => {
    // The banner is one line on the public site. Preserving newlines would let
    // a notice push the page content off-screen.
    expect(normalizeUrgentNoticeText('Water\nshut off\n\n  today')).toBe(
      'Water shut off today',
    );
  });

  it('accepts text of exactly 240 characters', () => {
    const exact = 'a'.repeat(240);
    expect(normalizeUrgentNoticeText(exact)).toBe(exact);
  });

  it('rejects 241 characters — the cap is server-side, not advisory', () => {
    expect(() => normalizeUrgentNoticeText('a'.repeat(241))).toThrow(
      /240 characters/i,
    );
  });

  it('measures length AFTER trimming, so trailing whitespace cannot be smuggled in', () => {
    // 240 real characters plus padding is a legal notice, not an over-length one.
    const padded = `  ${'a'.repeat(240)}  `;
    expect(normalizeUrgentNoticeText(padded)).toHaveLength(240);
  });

  it('measures length AFTER collapsing whitespace', () => {
    // 120 words separated by 10 spaces each would exceed 240 raw but not once
    // collapsed. The user typed a legal notice; accept it.
    const raw = Array.from({ length: 60 }, () => 'ab').join('          ');
    expect(raw.length).toBeGreaterThan(240);
    expect(normalizeUrgentNoticeText(raw)).toHaveLength(179);
  });

  it('counts astral-plane characters by code point, not UTF-16 unit', () => {
    // 240 emoji are 480 UTF-16 units. `.length` would reject a notice that is
    // 240 characters to every human who looks at it.
    const emoji = '🌀'.repeat(240);
    expect(emoji.length).toBe(480);
    expect(normalizeUrgentNoticeText(emoji)).toBe(emoji);
    expect(() => normalizeUrgentNoticeText('🌀'.repeat(241))).toThrow();
  });

  it('rejects empty and whitespace-only input', () => {
    expect(() => normalizeUrgentNoticeText('')).toThrow(/cannot be empty/i);
    expect(() => normalizeUrgentNoticeText('   \n\t  ')).toThrow(/cannot be empty/i);
  });

  it('does NOT strip or escape markup — escaping is the renderer\'s job', () => {
    // The banner renders as a React text child, which escapes on output. If
    // this function sanitised here instead, a later renderer change could
    // silently remove the only real defence. Keep the payload intact and let
    // the render test prove it is inert.
    const payload = '<script>alert(1)</script>';
    expect(normalizeUrgentNoticeText(payload)).toBe(payload);
  });
});

describe('isUrgentNoticeActive', () => {
  it('is inactive when there is no notice text', () => {
    expect(
      isUrgentNoticeActive({ urgentNoticeText: null, urgentNoticeExpiresAt: null }, NOW),
    ).toBe(false);
  });

  it('is inactive when the text is whitespace only', () => {
    expect(
      isUrgentNoticeActive({ urgentNoticeText: '   ', urgentNoticeExpiresAt: null }, NOW),
    ).toBe(false);
  });

  it('is active indefinitely when no expiry is set', () => {
    expect(
      isUrgentNoticeActive({ urgentNoticeText: 'Boil water', urgentNoticeExpiresAt: null }, NOW),
    ).toBe(true);
  });

  it('is active when the expiry is in the future', () => {
    expect(
      isUrgentNoticeActive(
        { urgentNoticeText: 'Boil water', urgentNoticeExpiresAt: new Date('2026-07-27T12:00:01.000Z') },
        NOW,
      ),
    ).toBe(true);
  });

  it('is INACTIVE when the expiry has passed, even though the row still exists', () => {
    // The row is deliberately not swept. This comparison is the only thing
    // standing between a stale banner and every visitor.
    expect(
      isUrgentNoticeActive(
        { urgentNoticeText: 'Boil water', urgentNoticeExpiresAt: new Date('2026-07-27T11:59:59.000Z') },
        NOW,
      ),
    ).toBe(false);
  });

  it('is inactive at the exact expiry instant — expiry is inclusive', () => {
    expect(
      isUrgentNoticeActive({ urgentNoticeText: 'Boil water', urgentNoticeExpiresAt: NOW }, NOW),
    ).toBe(false);
  });

  it('accepts an ISO string expiry as well as a Date', () => {
    // The API serialises timestamps; the editor holds strings.
    expect(
      isUrgentNoticeActive(
        { urgentNoticeText: 'Boil water', urgentNoticeExpiresAt: '2026-07-27T11:59:59.000Z' },
        NOW,
      ),
    ).toBe(false);
    expect(
      isUrgentNoticeActive(
        { urgentNoticeText: 'Boil water', urgentNoticeExpiresAt: '2026-07-28T00:00:00.000Z' },
        NOW,
      ),
    ).toBe(true);
  });

  it('treats an unparseable expiry as no expiry rather than hiding the notice', () => {
    // Failing open matters here: a corrupt timestamp should not silently
    // suppress an active emergency banner. A manager can always remove it.
    expect(
      isUrgentNoticeActive({ urgentNoticeText: 'Boil water', urgentNoticeExpiresAt: 'not-a-date' }, NOW),
    ).toBe(true);
  });
});
