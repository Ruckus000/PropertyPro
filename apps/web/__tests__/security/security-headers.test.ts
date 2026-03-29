/**
 * P4-56: Security headers unit tests.
 *
 * Covers:
 * - CORS origin allowlist (localhost, production domain, subdomains)
 * - CORS headers shape for allowed origins
 * - Empty CORS headers for unknown origins
 * - Security header presence and values
 * - CSP header format and required directives
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  isAllowedOrigin,
  buildCorsHeaders,
  buildSecurityHeaders,
  buildCspHeader,
} from '../../src/lib/middleware/security-headers';

// ---------------------------------------------------------------------------
// isAllowedOrigin
// ---------------------------------------------------------------------------

describe('isAllowedOrigin', () => {
  it('allows localhost origin for development', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://localhost')).toBe(true);
  });

  it('allows 127.0.0.1 origin for development', () => {
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('allows production root domain', () => {
    expect(isAllowedOrigin('https://getpropertypro.com')).toBe(true);
  });

  it('allows production subdomains', () => {
    expect(isAllowedOrigin('https://sunset-condos.getpropertypro.com')).toBe(true);
    expect(isAllowedOrigin('https://pm.getpropertypro.com')).toBe(true);
    expect(isAllowedOrigin('https://palm-shores-hoa.getpropertypro.com')).toBe(true);
  });

  it('rejects unknown external origins', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://notgetpropertypro.com')).toBe(false);
    expect(isAllowedOrigin('https://getpropertypro.com.evil.com')).toBe(false);
  });

  it('rejects domains that contain the production domain but are not subdomains', () => {
    expect(isAllowedOrigin('https://evilgetpropertypro.com')).toBe(false);
    expect(isAllowedOrigin('https://prefix.getpropertypro.com.attacker.com')).toBe(false);
  });

  it('rejects malformed origin strings', () => {
    expect(isAllowedOrigin('not-a-url')).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });

  describe('with NEXT_PUBLIC_APP_URL configured', () => {
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://preview-deploy.vercel.app');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('allows origin matching NEXT_PUBLIC_APP_URL', () => {
      expect(isAllowedOrigin('https://preview-deploy.vercel.app')).toBe(true);
    });

    it('still rejects other Vercel deployment origins', () => {
      expect(isAllowedOrigin('https://other-deploy.vercel.app')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// buildCorsHeaders
// ---------------------------------------------------------------------------

describe('buildCorsHeaders', () => {
  it('returns CORS headers for an allowed origin', () => {
    const headers = buildCorsHeaders('https://getpropertypro.com');
    expect(headers['Access-Control-Allow-Origin']).toBe('https://getpropertypro.com');
    expect(headers['Access-Control-Allow-Methods']).toContain('GET');
    expect(headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(headers['Access-Control-Allow-Headers']).toContain('Content-Type');
    expect(headers['Vary']).toBe('Origin');
  });

  it('returns empty object for a disallowed origin', () => {
    const headers = buildCorsHeaders('https://evil.com');
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it('returns empty object when origin is null', () => {
    const headers = buildCorsHeaders(null);
    expect(Object.keys(headers)).toHaveLength(0);
  });

  it('sets Allow-Credentials to true', () => {
    const headers = buildCorsHeaders('http://localhost:3000');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('reflects the exact allowed origin (not a wildcard)', () => {
    const origin = 'https://sunset-condos.getpropertypro.com';
    const headers = buildCorsHeaders(origin);
    expect(headers['Access-Control-Allow-Origin']).toBe(origin);
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

// ---------------------------------------------------------------------------
// buildSecurityHeaders
// ---------------------------------------------------------------------------

describe('buildSecurityHeaders', () => {
  it('sets X-Content-Type-Options to nosniff', () => {
    const headers = buildSecurityHeaders();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
  });

  it('sets X-Frame-Options to DENY', () => {
    const headers = buildSecurityHeaders();
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('sets Referrer-Policy', () => {
    const headers = buildSecurityHeaders();
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  });

  it('sets Permissions-Policy', () => {
    const headers = buildSecurityHeaders();
    expect(headers['Permissions-Policy']).toBeDefined();
    // Camera, microphone, and geolocation should be disabled
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Permissions-Policy']).toContain('microphone=()');
  });

  it('sets X-DNS-Prefetch-Control', () => {
    const headers = buildSecurityHeaders();
    expect(headers['X-DNS-Prefetch-Control']).toBe('off');
  });

  describe('with isPreview option', () => {
    it('omits X-Frame-Options when isPreview is true (CSP frame-ancestors is authoritative)', () => {
      const headers = buildSecurityHeaders({ isPreview: true });
      expect(headers['X-Frame-Options']).toBeUndefined();
    });

    it('preserves all other security headers when isPreview is true', () => {
      const headers = buildSecurityHeaders({ isPreview: true });
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headers['Permissions-Policy']).toContain('camera=()');
      expect(headers['X-DNS-Prefetch-Control']).toBe('off');
    });

    it('still returns DENY when isPreview is false', () => {
      const headers = buildSecurityHeaders({ isPreview: false });
      expect(headers['X-Frame-Options']).toBe('DENY');
    });
  });
});

// ---------------------------------------------------------------------------
// buildCspHeader
// ---------------------------------------------------------------------------

describe('buildCspHeader', () => {
  it('includes default-src self', () => {
    const csp = buildCspHeader();
    expect(csp).toContain("default-src 'self'");
  });

  it('includes script-src self', () => {
    const csp = buildCspHeader();
    expect(csp).toContain("script-src 'self'");
  });

  it('includes style-src self and unsafe-inline', () => {
    const csp = buildCspHeader();
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('includes frame-ancestors none to prevent clickjacking', () => {
    const csp = buildCspHeader();
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('includes object-src none', () => {
    const csp = buildCspHeader();
    expect(csp).toContain("object-src 'none'");
  });

  it('includes base-uri self', () => {
    const csp = buildCspHeader();
    expect(csp).toContain("base-uri 'self'");
  });

  it('includes form-action self', () => {
    const csp = buildCspHeader();
    expect(csp).toContain("form-action 'self'");
  });

  it('includes connect-src for Sentry', () => {
    const csp = buildCspHeader();
    expect(csp).toContain('https://*.ingest.sentry.io');
  });

  it('includes connect-src for Stripe', () => {
    const csp = buildCspHeader();
    expect(csp).toContain('https://api.stripe.com');
  });

  describe('with isPreview option', () => {
    it('replaces frame-ancestors none with self and admin origins when isPreview is true', () => {
      const csp = buildCspHeader({ isPreview: true });
      expect(csp).not.toContain("frame-ancestors 'none'");
      expect(csp).toContain("frame-ancestors 'self'");
    });

    it('includes localhost admin origins in development', () => {
      vi.stubEnv('NODE_ENV', 'development');
      const csp = buildCspHeader({ isPreview: true });
      expect(csp).toContain('http://localhost:*');
      expect(csp).toContain('http://127.0.0.1:*');
      vi.unstubAllEnvs();
    });

    it('uses ADMIN_ORIGIN env var when set', () => {
      vi.stubEnv('ADMIN_ORIGIN', 'https://custom-admin.example.com');
      const csp = buildCspHeader({ isPreview: true });
      expect(csp).toContain('https://custom-admin.example.com');
      expect(csp).not.toContain('http://localhost:3001');
      vi.unstubAllEnvs();
    });

    it('includes PM and Admin origins in production fallback when ADMIN_ORIGIN is unset', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('ADMIN_ORIGIN', '');
      const csp = buildCspHeader({ isPreview: true });
      expect(csp).toContain('https://pm.getpropertypro.com');
      expect(csp).toContain('https://admin.getpropertypro.com');
      vi.unstubAllEnvs();
    });

    it('still returns frame-ancestors none when isPreview is false', () => {
      const csp = buildCspHeader({ isPreview: false });
      expect(csp).toContain("frame-ancestors 'none'");
    });
  });
});
