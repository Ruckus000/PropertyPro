/**
 * POST /api/v1/reauth/verify
 *
 * Verifies the user's current password and mints a short-lived pp-reauth
 * cookie (15 min) that is required by sensitive routes (export, billing
 * portal, account deletion).
 *
 * The password is verified server-side via a stateless Supabase client so
 * a stolen session cookie alone cannot grant re-auth status.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { withErrorHandler } from '@/lib/api/error-handler';
import { UnauthorizedError, BadRequestError } from '@/lib/api/errors';
import { requireAuthenticatedUser } from '@/lib/api/auth';
import { mintReauthCookie } from '@/lib/api/reauth-guard';

const BodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  // 1. Require active session and resolve the user's email
  const user = await requireAuthenticatedUser();
  if (!user.email) {
    throw new UnauthorizedError('Cannot re-authenticate without an email address');
  }

  // 2. Parse and validate request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new BadRequestError('Request body must be JSON');
  }
  const parseResult = BodySchema.safeParse(body);
  if (!parseResult.success) {
    throw new BadRequestError(parseResult.error.issues[0]?.message ?? 'Invalid request');
  }
  const { password } = parseResult.data;

  // 3. Verify the password using a stateless Supabase client
  //    (persistSession: false means no cookies are written — we only check the result)
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

  // 4. Mint the pp-reauth cookie and return it in the response
  const { name, value, ...options } = await mintReauthCookie(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(name, value, options);
  return response;
});
