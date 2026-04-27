import { describe, it, expect } from 'vitest';
import { isAllowedLinkHref, ALLOWED_LINK_PROTOCOLS } from '../../src/editor/extensions';

describe('isAllowedLinkHref', () => {
  it('accepts http://', () => {
    expect(isAllowedLinkHref('http://example.com')).toBe(true);
  });

  it('accepts https://', () => {
    expect(isAllowedLinkHref('https://example.com/path?q=1')).toBe(true);
  });

  it('accepts mailto:', () => {
    expect(isAllowedLinkHref('mailto:a@b.c')).toBe(true);
  });

  it('accepts tel:', () => {
    expect(isAllowedLinkHref('tel:+15551234')).toBe(true);
  });

  it('is case-insensitive on the scheme', () => {
    expect(isAllowedLinkHref('HTTPS://example.com')).toBe(true);
    expect(isAllowedLinkHref('MailTo:a@b.c')).toBe(true);
  });

  it('rejects javascript:', () => {
    expect(isAllowedLinkHref('javascript:alert(1)')).toBe(false);
  });

  it('rejects data:', () => {
    expect(isAllowedLinkHref('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects vbscript:', () => {
    expect(isAllowedLinkHref('vbscript:msgbox(1)')).toBe(false);
  });

  it('rejects protocol-relative //evil.com', () => {
    expect(isAllowedLinkHref('//evil.example.com/x')).toBe(false);
  });

  it('rejects single-slash relative paths', () => {
    expect(isAllowedLinkHref('/dashboard/foo')).toBe(false);
  });

  it('rejects bare host without scheme', () => {
    expect(isAllowedLinkHref('example.com')).toBe(false);
  });

  it('rejects empty / null / non-string input', () => {
    expect(isAllowedLinkHref('')).toBe(false);
    expect(isAllowedLinkHref(null)).toBe(false);
    expect(isAllowedLinkHref(undefined)).toBe(false);
    expect(isAllowedLinkHref(42)).toBe(false);
  });

  it('trims surrounding whitespace before scheme check', () => {
    expect(isAllowedLinkHref('  https://example.com  ')).toBe(true);
  });

  it('exposes the protocol allowlist', () => {
    expect(ALLOWED_LINK_PROTOCOLS).toEqual(['http', 'https', 'mailto', 'tel']);
  });
});
