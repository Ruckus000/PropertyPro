import { describe, it, expect, vi } from 'vitest';

// SUPABASE_URL must be set BEFORE the sanitizer module loads — it caches
// the host at module scope. vi.hoisted runs before any import is resolved.
vi.hoisted(() => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://test-project.supabase.co';
});

import { sanitizeAuthoredHtml } from '../sanitize-authored-html';

describe('sanitizeAuthoredHtml — image src allowlist', () => {
  it('keeps relative /storage/ paths', () => {
    const out = sanitizeAuthoredHtml('<img src="/storage/authored-assets/abc.png">');
    expect(out).toContain('src="/storage/authored-assets/abc.png"');
  });

  it('keeps absolute URLs whose host matches SUPABASE_URL', () => {
    const out = sanitizeAuthoredHtml(
      '<img src="https://test-project.supabase.co/storage/v1/object/public/x.png">'
    );
    expect(out).toContain('src="https://test-project.supabase.co/storage/v1/object/public/x.png"');
  });

  it('strips external img src (different host)', () => {
    const out = sanitizeAuthoredHtml('<img src="https://evil.example.com/x.png">');
    expect(out).not.toContain('evil.example.com');
  });

  it('strips data: img src', () => {
    const out = sanitizeAuthoredHtml(
      '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=">'
    );
    expect(out).not.toContain('data:');
  });

  it('strips protocol-relative //evil.com img src', () => {
    const out = sanitizeAuthoredHtml('<img src="//evil.example.com/x.png">');
    expect(out).not.toContain('evil.example.com');
  });
});

describe('sanitizeAuthoredHtml — anchor href scheme allowlist', () => {
  it('keeps https:', () => {
    const out = sanitizeAuthoredHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it('keeps mailto:', () => {
    const out = sanitizeAuthoredHtml('<a href="mailto:a@b.c">x</a>');
    expect(out).toContain('href="mailto:a@b.c"');
  });

  it('keeps tel:', () => {
    const out = sanitizeAuthoredHtml('<a href="tel:+15551234">x</a>');
    expect(out).toContain('href="tel:+15551234"');
  });

  it('strips javascript: href', () => {
    const out = sanitizeAuthoredHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript');
  });

  it('strips protocol-relative //evil.com href', () => {
    const out = sanitizeAuthoredHtml('<a href="//evil.example.com">x</a>');
    expect(out).not.toContain('evil.example.com');
  });

  it('strips relative path href (per spec, only schemes are allowed for anchors)', () => {
    const out = sanitizeAuthoredHtml('<a href="/dashboard/foo">x</a>');
    expect(out).not.toContain('href=');
  });

  it('forces rel="noopener noreferrer" on target="_blank" anchors', () => {
    const out = sanitizeAuthoredHtml('<a href="https://example.com" target="_blank">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('noopener');
    expect(out).toContain('noreferrer');
  });
});

describe('sanitizeAuthoredHtml — script and dangerous-tag stripping', () => {
  it('strips <script> tags', () => {
    const out = sanitizeAuthoredHtml('<p>Hi</p><script>alert(1)</script>');
    expect(out).not.toContain('script');
  });

  it('strips <iframe>', () => {
    const out = sanitizeAuthoredHtml('<iframe src="https://evil.example.com"></iframe>');
    expect(out).not.toContain('iframe');
  });

  it('strips <style>', () => {
    const out = sanitizeAuthoredHtml('<style>body{display:none}</style><p>Hi</p>');
    expect(out).not.toContain('<style');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeAuthoredHtml('<p onclick="alert(1)">Hi</p>');
    expect(out).not.toContain('onclick');
  });

  it('strips style="" attributes', () => {
    const out = sanitizeAuthoredHtml('<p style="color:red">Hi</p>');
    expect(out).not.toContain('style=');
  });
});

describe('sanitizeAuthoredHtml — attribute allowlists', () => {
  it('keeps data-text-align with allowed value', () => {
    const out = sanitizeAuthoredHtml('<p data-text-align="center">Hi</p>');
    expect(out).toContain('data-text-align="center"');
  });

  it('strips data-text-align with disallowed value', () => {
    const out = sanitizeAuthoredHtml('<p data-text-align="javascript:1">Hi</p>');
    expect(out).not.toContain('data-text-align');
  });

  it('keeps allowed editor classes only', () => {
    const out = sanitizeAuthoredHtml('<a class="editor-link malicious-class">x</a>');
    expect(out).toContain('class="editor-link"');
    expect(out).not.toContain('malicious-class');
  });

  it('clamps width/height attributes', () => {
    const out = sanitizeAuthoredHtml('<img src="/storage/x.png" width="999999" height="-5">');
    expect(out).not.toContain('width="999999"');
    expect(out).not.toContain('height="-5"');
  });

  it('clamps colspan/rowspan to a sane bound', () => {
    const out = sanitizeAuthoredHtml('<table><tr><td colspan="9999">x</td></tr></table>');
    expect(out).not.toContain('colspan="9999"');
  });
});

describe('sanitizeAuthoredHtml — concurrency safety', () => {
  it('produces identical output across N concurrent calls (hooks are not racy)', async () => {
    // Module-load hook registration means parallel calls share hooks safely.
    const input = '<p>Hi</p><a href="https://x.com" target="_blank">l</a><img src="/storage/a.png">';
    const results = await Promise.all(
      Array.from({ length: 25 }, () => Promise.resolve(sanitizeAuthoredHtml(input)))
    );
    const first = results[0]!;
    for (const r of results) {
      expect(r).toBe(first);
    }
    expect(first).toContain('noopener');
    expect(first).toContain('src="/storage/a.png"');
  });
});
