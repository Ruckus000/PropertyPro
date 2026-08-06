import { describe, expect, it } from 'vitest';
import {
  buildSupportSessionClearCookie,
  buildSupportSessionCookie,
  resolveSupportCookieHostname,
  SUPPORT_SESSION_COOKIE_MAX_AGE_SECONDS,
} from '../src/http/support-cookie';
import {
  SUPPORT_SESSION_COOKIE,
  SUPPORT_SESSION_MAX_TTL_HOURS,
} from '../src/support-access';

describe('buildSupportSessionCookie', () => {
  // The whole point of moving the cookie server-side. `document.cookie` cannot
  // set HttpOnly, which is why the old client-written token was readable by
  // any script on any tenant subdomain.
  it('is HttpOnly', () => {
    expect(buildSupportSessionCookie('admin.getpropertypro.com', 'jwt').httpOnly).toBe(true);
  });

  it('scopes to the shared root domain so tenant subdomains receive it', () => {
    const cookie = buildSupportSessionCookie('admin.getpropertypro.com', 'jwt');

    expect(cookie.name).toBe(SUPPORT_SESSION_COOKIE);
    expect(cookie.domain).toBe('.getpropertypro.com');
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.path).toBe('/');
    expect(cookie.value).toBe('jwt');
  });

  // Admin is :3001 and web is :3000 locally. Cookies are not port-scoped, so a
  // host-only cookie already reaches both — and a Secure cookie over plain
  // http://localhost would simply be dropped, silently breaking the handoff.
  it('omits domain and Secure on local hostnames', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      const cookie = buildSupportSessionCookie(hostname, 'jwt');
      expect(cookie.domain, hostname).toBeUndefined();
      expect(cookie.secure, hostname).toBe(false);
    }
  });

  // The old client-side write hard-coded `max-age=3600`, inherited from a
  // one-hour TTL. The TTL later became 30 minutes and the cookie was not
  // updated, so the cookie outlived the JWT `exp` and the DB row by 30 minutes.
  it('derives max-age from the session TTL rather than a literal', () => {
    const cookie = buildSupportSessionCookie('admin.getpropertypro.com', 'jwt');

    expect(cookie.maxAge).toBe(SUPPORT_SESSION_MAX_TTL_HOURS * 3600);
    expect(cookie.maxAge).toBe(SUPPORT_SESSION_COOKIE_MAX_AGE_SECONDS);
    expect(cookie.maxAge).not.toBe(3600);
  });
});

describe('buildSupportSessionClearCookie', () => {
  // A cookie is identified by (name, domain, path). Clearing with a different
  // triple writes a SECOND cookie instead of removing the first — which is
  // exactly how web middleware's bare `cookies.delete(name)` left a
  // domain-scoped support cookie alive after deciding it was invalid.
  it('matches the set cookie identity exactly', () => {
    const hostname = 'sunset.getpropertypro.com';
    const set = buildSupportSessionCookie(hostname, 'jwt');
    const clear = buildSupportSessionClearCookie(hostname);

    expect(clear.name).toBe(set.name);
    expect(clear.domain).toBe(set.domain);
    expect(clear.path).toBe(set.path);
  });

  it('expires immediately with an empty value', () => {
    const clear = buildSupportSessionClearCookie('sunset.getpropertypro.com');

    expect(clear.maxAge).toBe(0);
    expect(clear.value).toBe('');
  });
});

describe('resolveSupportCookieHostname', () => {
  function req(headers: Record<string, string>, url = 'https://fallback.example/api') {
    return { headers: new Headers(headers), url };
  }

  it('prefers x-forwarded-host over the request URL', () => {
    expect(
      resolveSupportCookieHostname(req({ 'x-forwarded-host': 'admin.getpropertypro.com' })),
    ).toBe('admin.getpropertypro.com');
  });

  it('falls back to Host, then to the URL', () => {
    expect(resolveSupportCookieHostname(req({ host: 'admin.getpropertypro.com' }))).toBe(
      'admin.getpropertypro.com',
    );
    expect(resolveSupportCookieHostname(req({}))).toBe('fallback.example');
  });

  // A port would make the value fail `isLocalSupportHostname`, so `localhost:3001`
  // would be treated as a REMOTE host — yielding domain `.localhost:3001` and a
  // Secure cookie, both of which the browser rejects. The handoff would break
  // in local dev and in the e2e suite.
  it('strips the port', () => {
    expect(resolveSupportCookieHostname(req({ host: 'localhost:3001' }))).toBe('localhost');
    expect(resolveSupportCookieHostname(req({ host: '[::1]:3001' }))).toBe('[::1]');
  });

  it('takes the first entry of a proxy chain and lowercases', () => {
    expect(
      resolveSupportCookieHostname(
        req({ 'x-forwarded-host': 'Admin.GetPropertyPro.com, internal.vercel' }),
      ),
    ).toBe('admin.getpropertypro.com');
  });
});
