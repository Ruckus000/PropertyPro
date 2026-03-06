import { NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';

/**
 * Non-throwing platform admin guard for API routes.
 * Returns `null` when authorized, otherwise a standardized error response.
 */
export async function authorizePlatformAdminRequest(): Promise<NextResponse | null> {
  try {
    await requirePlatformAdmin();
    return null;
  } catch (error) {
    if (error instanceof Response) {
      const message = error.status === 401
        ? 'Unauthorized'
        : error.status === 403
          ? 'Forbidden'
          : error.status === 500
            ? 'Server misconfiguration'
            : 'Internal server error';

      return NextResponse.json({ error: { message } }, { status: error.status });
    }

    console.error('[Admin] Platform admin authorization error:', error);
    return NextResponse.json(
      { error: { message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
