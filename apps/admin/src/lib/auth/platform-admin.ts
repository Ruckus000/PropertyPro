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
import { ADMIN_COOKIE_OPTIONS } from './cookie-config';

const AdminRowSchema = z.object({ role: z.enum(['super_admin']) });

export interface PlatformAdminUser {
  id: string;
  email: string;
  role: 'super_admin';
}

/**
 * Extract Supabase session from cookies, verify platform_admin_users row.
 * Throws a Response with status 401/403 if not a platform admin.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminUser> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Response('Server misconfiguration', { status: 500 });
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
    throw new Response('Unauthorized', { status: 401 });
  }

  const adminDb = createAdminClient();
  const { data } = await adminDb
    .from('platform_admin_users')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const adminRow = AdminRowSchema.safeParse(data);
  if (!adminRow.success) {
    throw new Response('Forbidden', { status: 403 });
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
