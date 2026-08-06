import { describe, expect, it } from 'vitest';
import {
  scrubBrowserEvent,
  scrubQueryString,
  scrubUrl,
} from '../src/observability/scrub-browser-event';

describe('scrubQueryString', () => {
  it('redacts values of credential-named params, keeping the keys', () => {
    expect(scrubQueryString('token=abc123&preview=true')).toBe(
      'token=[redacted]&preview=true',
    );
  });

  // The anchored version of this rule matched `token` but not `access-token`,
  // `demo_token` or `inviteToken` — while its docblock sold it as future-proofing.
  it('redacts compound credential names, not just exact ones', () => {
    for (const key of ['access-token', 'demo_token', 'inviteToken', 'csrf_token', 'reset_token']) {
      expect(scrubQueryString(`${key}=abc123`), key).toBe(`${key}=[redacted]`);
    }
  });

  // Short generic words are sensitive whole, but must not swallow compounds.
  it('redacts bare `code` and `key` without eating zipcode or countryCode', () => {
    expect(scrubQueryString('code=abc&key=xyz')).toBe('code=[redacted]&key=[redacted]');
    expect(scrubQueryString('zipcode=33139&countryCode=US')).toBe('zipcode=33139&countryCode=US');
  });

  it('keeps innocuous names that merely contain a sensitive substring', () => {
    expect(scrubQueryString('authorId=7&tokenCount=3')).toBe('authorId=7&tokenCount=3');
  });

  it('redacts a credential-shaped value under an innocuous name', () => {
    // The parameter nobody thought to add to the name list.
    const jwt = 'eyJhbGciOi.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4';
    expect(scrubQueryString(`ref=${jwt}`)).toBe('ref=[redacted]');
    expect(scrubQueryString(`x=${'a1b2c3d4'.repeat(6)}`)).toBe('x=[redacted]');
    // base64url, not hex. The value-shape rule claimed to cover both while
    // matching hex only — and most real credentials are base64url.
    expect(scrubQueryString(`ref2=${'aB3-_xYz'.repeat(6)}`)).toBe('ref2=[redacted]');
  });

  it('leaves ordinary params alone', () => {
    expect(scrubQueryString('communityId=42&page=3&sort=name')).toBe(
      'communityId=42&page=3&sort=name',
    );
  });

  it('handles a leading ? , empty pairs and valueless params', () => {
    expect(scrubQueryString('?a=1&&b')).toBe('?a=1&&b');
    expect(scrubQueryString('')).toBe('');
  });

  it('does not throw on a malformed percent escape', () => {
    expect(() => scrubQueryString('token=%E0%A4%A')).not.toThrow();
    expect(scrubQueryString('token=%E0%A4%A')).toBe('token=[redacted]');
  });
});

describe('scrubUrl', () => {
  // The concrete case: admin's demo preview iframes.
  it('redacts the demo-login token but keeps origin and path', () => {
    expect(
      scrubUrl('https://sunset.getpropertypro.com/api/v1/auth/demo-login?token=deadbeef&preview=true'),
    ).toBe(
      'https://sunset.getpropertypro.com/api/v1/auth/demo-login?token=[redacted]&preview=true',
    );
  });

  it('handles relative URLs, which breadcrumbs often are', () => {
    expect(scrubUrl('/api/v1/documents?token=x&communityId=1')).toBe(
      '/api/v1/documents?token=[redacted]&communityId=1',
    );
  });

  it('preserves the fragment', () => {
    expect(scrubUrl('/p?token=x#section')).toBe('/p?token=[redacted]#section');
  });

  it('returns URLs without a query unchanged', () => {
    expect(scrubUrl('https://app.example/dashboard')).toBe('https://app.example/dashboard');
  });
});

describe('scrubBrowserEvent', () => {
  it('scrubs request url, query_string and fetch breadcrumb urls', () => {
    const event = scrubBrowserEvent({
      request: {
        url: 'https://admin.getpropertypro.com/demo/1/preview?token=secret1',
        query_string: 'token=secret2&ok=1',
        headers: { authorization: 'Bearer x', 'content-type': 'application/json' },
      },
      breadcrumbs: [
        { category: 'fetch', data: { url: '/api/v1/me?access_token=secret3' } },
        { category: 'navigation', data: { from: '/a?code=secret4', to: '/b?ok=1' } },
        { category: 'navigation', message: '/c?token=secret5' },
      ],
    });

    const serialized = JSON.stringify(event);
    for (const secret of ['secret1', 'secret2', 'secret3', 'secret4', 'secret5']) {
      expect(serialized).not.toContain(secret);
    }
    // Kept: the parts that make an event triageable.
    expect(event.request.url).toContain('/demo/1/preview');
    expect(event.breadcrumbs[1]!.data!.to).toBe('/b?ok=1');
    expect(event.request.headers['content-type']).toBe('application/json');
  });

  it('drops sensitive headers if the SDK ever populates them', () => {
    const event = scrubBrowserEvent({
      request: { headers: { authorization: 'Bearer x', cookie: 'sb=1', accept: '*/*' } },
    });

    expect(event.request.headers.authorization).toBeUndefined();
    expect(event.request.headers.cookie).toBeUndefined();
    expect(event.request.headers.accept).toBe('*/*');
  });

  // HTTP header names are case-insensitive, and `Authorization` is how it is
  // conventionally spelled. A literal-key delete missed exactly that.
  it('drops sensitive headers regardless of case', () => {
    const event = scrubBrowserEvent({
      request: { headers: { Authorization: 'Bearer x', Cookie: 'sb=1', 'X-Api-Key': 'k' } },
    });

    expect(JSON.stringify(event)).not.toContain('Bearer x');
    expect(JSON.stringify(event)).not.toContain('sb=1');
    expect(JSON.stringify(event)).not.toContain('"k"');
  });

  it('passes through an event with nothing to scrub', () => {
    const event = { message: 'boom' };
    expect(scrubBrowserEvent(event)).toBe(event);
  });

  // A beforeSend that throws makes Sentry DROP the event, which would silently
  // disable error reporting — strictly worse than the leak it guards against.
  it('never throws on a malformed event', () => {
    expect(() => scrubBrowserEvent(null)).not.toThrow();
    expect(() => scrubBrowserEvent(undefined)).not.toThrow();
    expect(() => scrubBrowserEvent({ request: 'not-an-object' })).not.toThrow();
    expect(() => scrubBrowserEvent({ breadcrumbs: [null, 3, 'x'] })).not.toThrow();
  });
});
