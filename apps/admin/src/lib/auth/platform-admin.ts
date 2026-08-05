/**
 * Platform admin authentication utilities for apps/admin.
 *
 * Note: placed in apps/admin (not packages/shared) because it depends on
 * @propertypro/db and Next.js types — adding those to packages/shared
 * would break its zero-dependency contract.
 */
import { z } from 'zod';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import {
  AppError,
  ForbiddenError,
  UnauthorizedError,
} from '@propertypro/shared/http';
import { ADMIN_COOKIE_OPTIONS } from './cookie-config';

const AdminRowSchema = z.object({ role: z.enum(['super_admin']) });

export interface PlatformAdminUser {
  id: string;
  email: string;
  role: 'super_admin';
}

/**
 * Extract Supabase session from cookies, verify platform_admin_users row.
 *
 * Throws a typed `AppError` (401 `UnauthorizedError` / 403 `ForbiddenError`)
 * which `withAdminErrorHandler` turns into the correct HTTP status.
 *
 * NOTE: this previously did `throw new Response(...)`, a Remix idiom. The
 * Next.js App Router does not unwrap a thrown Response from a route handler —
 * it became an unhandled rejection and every auth denial surfaced as a generic
 * 500. It still failed closed, but the status was never the one intended, so
 * no test or client could assert on it.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminUser> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new AppError('Server misconfiguration', 500, 'SERVER_MISCONFIGURED');
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: ADMIN_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
    },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new UnauthorizedError();
  }

  const adminDb = createAdminClient();
  const { data } = await adminDb
    .from('platform_admin_users')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const adminRow = AdminRowSchema.safeParse(data);
  if (!adminRow.success) {
    throw new ForbiddenError('Platform admin access required');
  }

  return {
    id: user.id,
    email: user.email ?? '',
    role: adminRow.data.role,
  };
}

/**
 * Non-throwing variant for conditional rendering in RSC.
 * Returns null if the caller is not a platform admin.
 */
export async function getPlatformAdminSession(): Promise<PlatformAdminUser | null> {
  try {
    return await requirePlatformAdmin();
  } catch {
    return null;
  }
}
