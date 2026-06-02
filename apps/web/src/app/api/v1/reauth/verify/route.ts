/**
 * POST /api/v1/reauth/verify
 *
 * Plan A1 drain #171. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. The pp-reauth cookie is minted inside the handler and
 * applied on the outer `withErrorHandler` response (transparency #141 pattern).
 *
 * Verifies the user's current password and mints a short-lived pp-reauth
 * cookie (15 min) that is required by sensitive routes (export, billing
 * portal, account deletion).
 *
 * The password is verified server-side via a stateless Supabase client so
 * a stolen session cookie alone cannot grant re-auth status.
 */
import { createClient } from '@supabase/supabase-js';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, UnauthorizedError } from '@/lib/api/errors';
import { requireAuthenticatedUser } from '@/lib/api/auth';
import { mintReauthCookie } from '@/lib/api/reauth-guard';
import { reauthVerifyPostContract } from './contract';

export const POST = withErrorHandler(async (req, ctx) => {
  let cookieParams: Awaited<ReturnType<typeof mintReauthCookie>> | undefined;

  const inner = runRoute(reauthVerifyPostContract, async ({ body }) => {
    const user = await requireAuthenticatedUser();
    if (!user.email) {
      throw new UnauthorizedError('Cannot re-authenticate without an email address');
    }

    const { password } = body;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await anonClient.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (signInError) {
      throw new UnauthorizedError('Incorrect password');
    }

    try {
      cookieParams = await mintReauthCookie(user.id);
    } catch (err) {
      console.error('[reauth] mintReauthCookie failed:', err);
      throw new AppError(
        'Re-authentication is misconfigured on the server. Please contact support.',
        500,
        'REAUTH_MISCONFIGURED',
      );
    }

    return { ok: true as const };
  });

  const res = await inner(req, ctx);
  if (cookieParams) {
    const { name, value, ...options } = cookieParams;
    res.cookies.set(name, value, options);
  }
  return res;
});
