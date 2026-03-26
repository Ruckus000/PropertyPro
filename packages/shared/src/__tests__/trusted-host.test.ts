import { describe, expect, it } from 'vitest';
import {
  isTrustedHostname,
  parseHostnameFromAppUrl,
} from '../trusted-host';

describe('parseHostnameFromAppUrl', () => {
  it('returns hostname from https URL', () => {
    expect(parseHostnameFromAppUrl('https://getpropertypro.com')).toBe('getpropertypro.com');
  });

  it('returns lowercase hostname', () => {
    expect(parseHostnameFromAppUrl('https://WWW.Example.COM/path')).toBe('www.example.com');
  });

  it('returns null for empty or invalid', () => {
    expect(parseHostnameFromAppUrl('')).toBeNull();
    expect(parseHostnameFromAppUrl(null)).toBeNull();
    expect(parseHostnameFromAppUrl('not-a-url')).toBeNull();
  });
});

describe('isTrustedHostname', () => {
  it('allows localhost and loopback', () => {
    expect(isTrustedHostname('localhost')).toBe(true);
    expect(isTrustedHostname('127.0.0.1')).toBe(true);
  });

  it('allows primary apex and subdomains when primaryHostname is set', () => {
    expect(isTrustedHostname('getpropertypro.com', { primaryHostname: 'getpropertypro.com' })).toBe(true);
    expect(
      isTrustedHostname('sunset.getpropertypro.com', { primaryHostname: 'getpropertypro.com' }),
    ).toBe(true);
    expect(isTrustedHostname('evil.getpropertypro.com', { primaryHostname: 'getpropertypro.com' })).toBe(
      true,
    );
  });

  it('rejects unrelated domains when only primary is getpropertypro.com', () => {
    expect(isTrustedHostname('evil.com', { primaryHostname: 'getpropertypro.com' })).toBe(false);
  });

  it('allows legacy propertyprofl.com and subdomains without primary', () => {
    expect(isTrustedHostname('propertyprofl.com')).toBe(true);
    expect(isTrustedHostname('sunset-condos.propertyprofl.com')).toBe(true);
  });
});
