import { NextResponse } from 'next/server';

/**
 * @deprecated Moved to admin app: apps/admin/src/app/api/admin/demos/[slug]/convert/route.ts
 *
 * The web app's admin conversion route required a web-app session cookie
 * that the admin app couldn't provide (different cookie names). The route
 * now lives in the admin app where it authenticates via the admin session.
 */
export async function POST() {
  return NextResponse.json(
    { error: { code: 'DEPRECATED', message: 'This endpoint has been moved to the admin app API' } },
    { status: 410 },
  );
}

export async function OPTIONS() {
  return NextResponse.json(
    { error: { code: 'DEPRECATED', message: 'This endpoint has been moved to the admin app API' } },
    { status: 410 },
  );
}
