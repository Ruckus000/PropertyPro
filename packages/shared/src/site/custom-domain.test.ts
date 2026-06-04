import { describe, it, expect } from 'vitest';
import {
  sanitizeCustomDomain,
  isOwnDomain,
  assertCustomDomainAllowed,
} from './custom-domain';

describe('sanitizeCustomDomain', () => {
  it('accepts and lowercases a valid host', () => {
    expect(sanitizeCustomDomain('WWW.SunsetCondos.com')).toBe('www.sunsetcondos.com');
  });
  it('strips protocol, path, query, fragment and port', () => {
    expect(sanitizeCustomDomain('https://www.foo.com:443/path?x#y')).toBe('www.foo.com');
  });
  it('rejects single-label and malformed hosts', () => {
    expect(sanitizeCustomDomain('localhost')).toBeNull();
    expect(sanitizeCustomDomain('-bad.com')).toBeNull();
    expect(sanitizeCustomDomain('')).toBeNull();
    expect(sanitizeCustomDomain(null)).toBeNull();
  });
});

describe('isOwnDomain', () => {
  it('flags the root domain and its subdomains', () => {
    expect(isOwnDomain('getpropertypro.com', 'getpropertypro.com')).toBe(true);
    expect(isOwnDomain('cam.getpropertypro.com', 'getpropertypro.com')).toBe(true);
    expect(isOwnDomain('www.sunsetcondos.com', 'getpropertypro.com')).toBe(false);
  });
  it('strips a port on the root domain before comparing', () => {
    expect(isOwnDomain('sunset.localhost', 'localhost:3000')).toBe(true);
  });
  it('does not flag a domain that shares a suffix but is not a subdomain', () => {
    expect(isOwnDomain('evilgetpropertypro.com', 'getpropertypro.com')).toBe(false);
  });
});

describe('assertCustomDomainAllowed', () => {
  it('returns the sanitized host when valid and not own-domain', () => {
    expect(assertCustomDomainAllowed('www.foo.com', 'getpropertypro.com')).toBe('www.foo.com');
  });
  it('throws on an invalid host', () => {
    expect(() => assertCustomDomainAllowed('nope', 'getpropertypro.com')).toThrow(/invalid/i);
  });
  it('throws on an own-domain host', () => {
    expect(() => assertCustomDomainAllowed('x.getpropertypro.com', 'getpropertypro.com')).toThrow(/reserved/i);
  });
});
