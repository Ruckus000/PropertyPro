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
 * THE SESSION IS DISCARDED, deliberately. The cookie adapter below is a no-op,
 * so no auth cookies are written. Nothing downstream needs one: `signup-form.tsx`
 * confirms with a `signupRequestId` and never touches a session, and
 * `/signup/checkout` is public. This also preserves current behaviour rather
 * than changing it — the browser client uses PKCE, and a code issued to a
 * server-side `generateLink` has no verifier in the user's browser, so today's
 * redirect cannot establish a working session either.
 *
 * ONE OUTCOME, whether the token is good or not: redirect to `/signup` with
 * `verified=1`. `signup-form.tsx` then calls `confirm-verification`, which reads
 * `email_confirmed_at` and is the authority. On a spent or expired token it
 * answers "Email has not been verified yet. Please click the verification link
 * in your email." and renders the existing error card with its Retry button.
 * That is a correct message and an existing surface, so this route adds no error
 * UI of its own.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * `signup` for a first-time link, `magiclink` for the already-registered
 * fallback in `createOrLinkAuthAccount` and for every resend. The token is bound
 * to its type by Supabase, so a tampered value simply fails to verify — this
 * allowlist exists to keep an arbitrary string out of the SDK call, not as a
 * security boundary.
 */
const VERIFIABLE_TYPES = new Set(['signup', 'magiclink']);

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (tokenHash && VERIFIABLE_TYPES.has(type) && supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll: () => [],
        setAll: () => {
          /* no-op: see "THE SESSION IS DISCARDED" above */
        },
      },
    });

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'signup' | 'magiclink',
    });

    if (error) {
      // Not fatal, and not surfaced here: `confirm-verification` is the
      // authority on whether the email is confirmed and owns the user-facing
      // message. Logged without the token.
      console.error('[verify-signup] verifyOtp failed:', error.message);
    }
  }

  destination.searchParams.set('verified', '1');

  const response = NextResponse.redirect(destination);
  // The URL carried a single-use credential. Keep it out of shared caches.
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
