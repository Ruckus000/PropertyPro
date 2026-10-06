/**
 * GET /auth/verify-signup — finish email verification on OUR domain.
 *
 * The signup verification email used to link straight at Supabase's
 * `action_link`:
 *
 *   https://<project-ref>.supabase.co/auth/v1/verify?token=…&redirect_to=…
 *
 * A mail from `getpropertypro.com` whose only button points at an unrelated,
 * random-looking third-party host is the shape users are told not to click, and
 * it measurably landed in Gmail spam on two independent accounts — see
 * `docs/audits/2026-09-11-signup-verification-deliverability.md` for what that
 * does and does not prove. Invitations already send first-party links
 * (`invitations/route.ts:96`); signup verification was the outlier.
 *
 * `generateLink` returns `hashed_token` alongside `action_link`, and finishing
 * server-side with `verifyOtp` is already how three other call sites avoid
 * showing a user a Supabase URL at all: `demo-session.ts:73`,
 * `dev/agent-login/route.ts:150` and `provisioning-service.ts`.
 *
 * THE SESSION IS KEPT FOR EMAIL-FIRST LINKS ONLY — those without a
 * `signupRequestId`. `verifyOtp` with a `token_hash` returns a session directly
 * (no PKCE verifier is involved), and the cookie adapter below writes it onto
 * the redirect, the same shape as `lib/services/demo-session.ts`. Email-first
 * signup (`lib/auth/signup-email-first.ts`) depends on it: the user answers the
 * community questions signed in, and `POST /auth/signup/details` is
 * session-authenticated.
 *
 * Form-flow links (they carry a `signupRequestId`) still DISCARD it, as before:
 * that flow set a password up front and confirms with the id, so a session
 * would only widen what an emailed link can do there.
 *
 * Email-first links are BOUND TO THE BROWSER THAT REQUESTED THEM (`b` is the
 * SHA-256 of that browser's `pp_signup_binding` cookie; see
 * `lib/auth/signup-binding.ts`). Without it, a link an attacker requested for
 * their own address would sign in whoever they lured into opening it (login
 * CSRF). An unbound or mismatched open does NOT call `verifyOtp`, so the
 * single-use token stays valid for the right browser, and lands on
 * `/signup?link=other-device`. A bound open expires the cookie, so the link
 * cannot be replayed from that browser.
 *
 * ONE OUTCOME, whether the token is good or not: redirect to `/signup` with
 * `verified=1`. `signup-form.tsx` then calls `confirm-verification`, which reads
 * `email_confirmed_at` and is the authority. On a spent or expired token it
 * answers "Email has not been verified yet. Please click the verification link
 * in your email." and renders the existing error card with its Retry button.
 * That is a correct message and an existing surface, so this route adds no error
 * UI of its own. An email-first link carries no `signupRequestId`; there the
 * signup page reads the session, and a spent link simply leaves none.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getCookieOptions } from '@propertypro/db/supabase/cookie-config';
import {
  SIGNUP_BINDING_COOKIE,
  SIGNUP_BINDING_PATTERN,
  bindingMatches,
  sha256Hex,
} from '@/lib/auth/signup-binding';

/**
 * `signup` for a first-time link, `magiclink` for the already-registered
 * fallback in `createOrLinkAuthAccount` and for every resend. The token is bound
 * to its type by Supabase, so a tampered value simply fails to verify — this
 * allowlist exists to keep an arbitrary string out of the SDK call, not as a
 * security boundary.
 */
const VERIFIABLE_TYPES = new Set(['signup', 'magiclink']);

type SessionCookie = { name: string; value: string; options?: Record<string, unknown> };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get('token_hash');
  const type = params.get('type') ?? 'signup';
  const signupRequestId = params.get('signupRequestId');

  // Redirect to the host the user actually arrived on, so this does not add a
  // hop of its own. (The apex -> www redirect still applies to the emailed link
  // itself; settling that is a separate change — see DEPLOYMENT.md §5.1.)
  const destination = new URL('/signup', request.nextUrl.origin);
  if (signupRequestId) {
    destination.searchParams.set('signupRequestId', signupRequestId);
  }

  // Email-first only: proceed only in the browser that asked for the link.
  if (!signupRequestId) {
    const expected = params.get('b') ?? '';
    const nonce = request.cookies.get(SIGNUP_BINDING_COOKIE)?.value;
    const bound =
      SIGNUP_BINDING_PATTERN.test(expected)
      && Boolean(nonce)
      && bindingMatches(expected, await sha256Hex(nonce as string));
    if (!bound) {
      const elsewhere = new URL('/signup', request.nextUrl.origin);
      elsewhere.searchParams.set('link', 'other-device');
      const refused = NextResponse.redirect(elsewhere);
      refused.headers.set('Cache-Control', 'no-store');
      return refused;
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const sessionCookies: SessionCookie[] = [];
  let verified = false;

  if (tokenHash && VERIFIABLE_TYPES.has(type) && supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookieOptions: getCookieOptions(),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Replayed onto the redirect below for email-first links only: see
          // "THE SESSION IS KEPT FOR EMAIL-FIRST LINKS ONLY".
          if (!signupRequestId) sessionCookies.push(...cookiesToSet);
        },
      },
    });

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'magiclink',
    });

    verified = !error;
    if (error) {
      // Not fatal, and not surfaced here: `confirm-verification` is the
      // authority on whether the email is confirmed and owns the user-facing
      // message. Logged without the token.
      console.error('[verify-signup] verifyOtp failed:', error.message);
    }
  }

  destination.searchParams.set('verified', '1');

  const response = NextResponse.redirect(destination);
  for (const { name, value, options } of sessionCookies) {
    response.cookies.set(name, value, options);
  }
  if (!signupRequestId && verified) {
    // Spent: this browser cannot replay the link.
    response.cookies.set(SIGNUP_BINDING_COOKIE, '', { path: '/', maxAge: 0 });
  }
  // The URL carried a single-use credential. Keep it out of shared caches.
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
