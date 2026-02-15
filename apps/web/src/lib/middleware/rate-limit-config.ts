/**
 * Rate limit configuration per route category.
 *
 * Different endpoint categories have different rate limits based on
 * their sensitivity and expected usage patterns.
 *
 * Key resolution:
 * - Unauthenticated routes: keyed by IP address
 * - Authenticated routes: keyed by user ID
 * - Webhook routes: exempt from rate limiting
 */

import type { NextRequest } from 'next/server';
import { type RateLimitResult, getRateLimiter } from './rate-limiter';

/** Rate limit tier defining requests per window. */
export interface RateLimitTier {
  /** Maximum requests allowed in the window. */
  limit: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

/** Route category for rate limiting purposes. */
export type RouteCategory = 'auth' | 'write' | 'read' | 'public' | 'webhook';

/** Rate limit tiers per route category. */
const RATE_LIMIT_TIERS: Record<RouteCategory, RateLimitTier> = {
  /** Auth routes (login, signup, password reset): 10 req/min per IP */
  auth: { limit: 10, windowMs: 60_000 },

  /** Write routes (POST, PATCH, DELETE): 30 req/min per user */
  write: { limit: 30, windowMs: 60_000 },

  /** Read routes (GET): 100 req/min per user */
  read: { limit: 100, windowMs: 60_000 },

  /** Public routes (no auth): 60 req/min per IP */
  public: { limit: 60, windowMs: 60_000 },

  /** Webhook routes: exempt (Stripe retries need to succeed) */
  webhook: { limit: 0, windowMs: 0 },
};

/** Auth route path prefixes (login, signup, password reset). */
const AUTH_RATE_LIMIT_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/signup',
  '/api/v1/auth/register',
  '/api/v1/auth/password-reset',
  '/api/v1/auth/forgot-password',
  '/auth/login',
  '/auth/signup',
  '/auth/register',
  '/auth/password-reset',
  '/auth/forgot-password',
];

/** Webhook route path prefixes (exempt from rate limiting). */
const WEBHOOK_PATHS = [
  '/api/v1/webhooks/',
  '/api/webhooks/',
];

/** API route prefix for identifying API requests. */
const API_PREFIX = '/api/';

/**
 * Classify a request into a rate limit category based on its path and method.
 */
export function classifyRoute(pathname: string, method: string): RouteCategory {
  // Webhook routes are always exempt
  if (WEBHOOK_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return 'webhook';
  }

  // Auth routes have strict limits
  if (AUTH_RATE_LIMIT_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return 'auth';
  }

  // API routes are classified by HTTP method
  if (pathname.startsWith(API_PREFIX)) {
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return 'read';
    }
    return 'write';
  }

  // Everything else is a public route
  return 'public';
}

/**
 * Extract the client IP address from a request.
 *
 * Checks standard proxy headers in order of preference.
 * Falls back to 'unknown' if no IP can be determined.
 */
export function extractClientIp(request: NextRequest): string {
  // Vercel-specific header
  const vercelIp = request.headers.get('x-real-ip');
  if (vercelIp) return vercelIp;

  // Standard proxy header (first IP in chain)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  return 'unknown';
}

/**
 * Build the rate limit key for a request.
 *
 * - Auth/public routes: keyed by IP address with category prefix
 * - Authenticated API routes: keyed by user ID with category prefix
 * - Falls back to IP if no user ID is available
 */
export function buildRateLimitKey(
  category: RouteCategory,
  ip: string,
  userId: string | null,
): string {
  if (category === 'auth' || category === 'public') {
    return `rl:${category}:ip:${ip}`;
  }

  // Authenticated routes: prefer user ID, fall back to IP
  const identifier = userId || `ip:${ip}`;
  return `rl:${category}:${identifier}`;
}

/**
 * Get the rate limit tier for a given route category.
 */
export function getTier(category: RouteCategory): RateLimitTier {
  return RATE_LIMIT_TIERS[category];
}

/** Result of rate limit check including category metadata. */
export interface RateLimitCheckResult extends RateLimitResult {
  /** The route category that was matched. */
  category: RouteCategory;
}

/**
 * Check rate limit for a request.
 *
 * @param request - The incoming Next.js request
 * @param userId - The authenticated user ID, or null for unauthenticated requests
 * @returns Rate limit check result, or null if the route is exempt
 */
export function checkRateLimit(
  request: NextRequest,
  userId: string | null,
): RateLimitCheckResult | null {
  const { pathname } = request.nextUrl;
  const method = request.method;
  const category = classifyRoute(pathname, method);

  // Webhook routes are exempt
  if (category === 'webhook') {
    return null;
  }

  const tier = getTier(category);
  const ip = extractClientIp(request);
  const key = buildRateLimitKey(category, ip, userId);
  const limiter = getRateLimiter();
  const result = limiter.check(key, tier.limit, tier.windowMs);

  return { ...result, category };
}

/**
 * Build a 429 Too Many Requests JSON response.
 */
export function rateLimitedResponse(
  result: RateLimitCheckResult,
  requestId: string,
): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'rate_limited',
        message: 'Too many requests',
        retryAfter: result.retryAfter,
      },
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-Request-ID': requestId,
      },
    },
  );
}
