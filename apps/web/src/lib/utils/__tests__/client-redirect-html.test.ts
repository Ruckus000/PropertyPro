/**
 * The client-redirect page escapes the target for each context it is written
 * into, instead of relying on URL serialisation having percent-encoded the
 * dangerous characters. The escapers are tested with raw strings for that
 * reason: a `URL` cannot carry a literal `<` into its href, so a test that only
 * went through `URL` would pass with no escaping at all.
 */
import { describe, expect, it } from 'vitest';
import {
  buildClientRedirectHtml,
  escapeHtmlAttribute,
  toInlineScriptString,
} from '@/lib/utils/client-redirect-html';

describe('escapeHtmlAttribute', () => {
  it('escapes every character that can leave a quoted attribute or open a tag', () => {
    expect(escapeHtmlAttribute(`a&b"c'd<e>f`)).toBe('a&amp;b&quot;c&#39;d&lt;e&gt;f');
  });

  it('cannot close the meta tag', () => {
    const out = escapeHtmlAttribute('x"><script>alert(1)</script>');
    expect(out).not.toMatch(/[<>"]/);
  });
});

describe('toInlineScriptString', () => {
  it('round-trips to the original string', () => {
    const value = `https://a.test/p?x=1&y=</script><!--\u2028\u2029'"`;
    expect(JSON.parse(toInlineScriptString(value))).toBe(value);
  });

  it('cannot end the script element or open an HTML comment', () => {
    const out = toInlineScriptString('</script><script>alert(1)</script><!--');
    expect(out).not.toMatch(/[<>&]/);
    expect(out).not.toContain('</script');
    expect(out).not.toContain('<!--');
  });

  it('escapes the line and paragraph separators', () => {
    expect(toInlineScriptString('a\u2028b\u2029c')).toBe('"a\\u2028b\\u2029c"');
  });
});

describe('buildClientRedirectHtml', () => {
  it('writes the escaped target into the meta refresh and the script', () => {
    const html = buildClientRedirectHtml(new URL('https://getpropertypro.com/mobile?communityId=42&preview=true'));

    expect(html).toContain(
      '<meta http-equiv="refresh" content="0;url=https://getpropertypro.com/mobile?communityId=42&amp;preview=true">',
    );
    expect(html).toContain(
      'window.location.replace("https://getpropertypro.com/mobile?communityId=42\\u0026preview=true")',
    );
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:msgbox(1)'])(
    'refuses a %s target',
    (target) => {
      expect(() => buildClientRedirectHtml(new URL(target))).toThrow(/Refusing a client redirect/);
    },
  );

  it('accepts http for local development', () => {
    expect(() => buildClientRedirectHtml(new URL('http://localhost:3000/dashboard'))).not.toThrow();
  });
});
