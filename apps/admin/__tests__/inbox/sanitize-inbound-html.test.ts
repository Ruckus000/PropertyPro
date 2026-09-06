import { describe, expect, it } from 'vitest';

import { sanitizeInboundHtml } from '@/lib/server/sanitize-inbound-html';

/**
 * `html_body` is written by whoever emailed support@ — an anonymous party on
 * the public internet — and rendered in the platform admin console, the most
 * privileged surface in the product. Every case below is a stored-XSS vector
 * that would run with a `super_admin` session.
 *
 * The control cases matter as much as the attacks: a sanitizer that strips
 * everything is safe and useless, and would make the inbox unreadable.
 */
describe('sanitizeInboundHtml', () => {
  describe('script execution', () => {
    it('removes a script tag AND its contents', () => {
      const out = sanitizeInboundHtml('<p>Hi</p><script>alert(1)</script>');
      expect(out).not.toContain('script');
      // Not merely unwrapped: `alert(1)` must not survive as visible text.
      expect(out).not.toContain('alert(1)');
      expect(out).toContain('<p>Hi</p>');
    });

    it('removes inline event handlers', () => {
      const out = sanitizeInboundHtml('<img src="https://x.test/a.png" onerror="alert(1)">');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('alert');
    });

    it('removes an onclick on an otherwise allowed tag', () => {
      const out = sanitizeInboundHtml('<a href="https://x.test" onclick="steal()">click</a>');
      expect(out).not.toContain('onclick');
      expect(out).not.toContain('steal');
    });

    it('strips a javascript: href', () => {
      const out = sanitizeInboundHtml('<a href="javascript:alert(1)">click</a>');
      expect(out).not.toContain('javascript:');
    });

    it('strips a data:text/html href', () => {
      // `data:` is deliberately absent from allowedSchemes — it is a
      // navigation-based XSS vector even though compile-template.ts permits it
      // for operator-authored templates.
      const out = sanitizeInboundHtml(
        '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
      );
      expect(out).not.toContain('data:text/html');
    });
  });

  describe('dangerous elements', () => {
    // Split by parser semantics, not by taste. A VOID element has no contents
    // for `nonTextTags` to discard — `<meta>x</meta>` parses `x` as a SIBLING —
    // so asserting "contents are gone" there would be asserting something the
    // HTML parser makes impossible, and would fail against correct code.
    it.each(['iframe', 'object', 'form', 'style', 'textarea', 'noscript'])(
      'removes <%s> AND its contents',
      (tag) => {
        const out = sanitizeInboundHtml(`<p>ok</p><${tag}>PAYLOAD</${tag}>`);
        expect(out).not.toContain(`<${tag}`);
        // The contents assertion is the point: without `nonTextTags`,
        // sanitize-html drops the tag but leaves "PAYLOAD" as visible text
        // inside what looks like a genuine message from us.
        expect(out).not.toContain('PAYLOAD');
        expect(out).toContain('<p>ok</p>');
      },
    );

    it.each(['embed', 'base', 'meta', 'link', 'input'])('removes void <%s>', (tag) => {
      const out = sanitizeInboundHtml(`<p>ok</p><${tag}>`);
      expect(out).not.toContain(`<${tag}`);
      expect(out).toContain('<p>ok</p>');
    });
  });

  describe('remote images are blocked by default', () => {
    it('replaces a remote src with a placeholder and preserves the original', () => {
      // A remote image is a read receipt. An operator opening a privacy@
      // thread must not silently confirm to the sender that a human read it.
      const out = sanitizeInboundHtml('<img src="https://tracker.test/pixel.gif">');
      // `\ssrc=` and not a plain substring: `data-blocked-src="…"` contains the
      // URL legitimately, so a naive `not.toContain(url)` can never pass.
      expect(out).not.toMatch(/\ssrc=/);
      expect(out).toContain('data-blocked-src="https://tracker.test/pixel.gif"');
    });

    it('restores the source only on an explicit opt-in', () => {
      const out = sanitizeInboundHtml('<img src="https://tracker.test/pixel.gif">', {
        allowRemoteImages: true,
      });
      expect(out).toContain('src="https://tracker.test/pixel.gif"');
    });
  });

  describe('legitimate content survives', () => {
    // Anti-vacuity: without these, a sanitizer that returned '' would pass
    // every assertion above.
    it('keeps ordinary formatting', () => {
      const out = sanitizeInboundHtml(
        '<p>Hello <strong>there</strong>, see <em>below</em>.</p><ul><li>one</li></ul>',
      );
      expect(out).toContain('<strong>there</strong>');
      expect(out).toContain('<em>below</em>');
      expect(out).toContain('<li>one</li>');
    });

    it('keeps an https link and hardens its rel/target', () => {
      const out = sanitizeInboundHtml('<a href="https://example.com">example</a>');
      expect(out).toContain('href="https://example.com"');
      expect(out).toContain('rel="noopener noreferrer nofollow"');
      expect(out).toContain('target="_blank"');
    });

    it('keeps a mailto link', () => {
      const out = sanitizeInboundHtml('<a href="mailto:jane@example.com">Jane</a>');
      expect(out).toContain('mailto:jane@example.com');
    });

    it('keeps table markup, which quoted email replies rely on', () => {
      const out = sanitizeInboundHtml('<table><tr><td colspan="2">cell</td></tr></table>');
      expect(out).toContain('<td colspan="2">cell</td>');
    });
  });

  it('returns an empty string for a null body rather than throwing', () => {
    expect(sanitizeInboundHtml(null)).toBe('');
    expect(sanitizeInboundHtml('')).toBe('');
  });
});
