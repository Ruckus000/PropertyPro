/**
 * @deprecated Moved to admin app: apps/admin/src/app/api/admin/demos/[slug]/convert/route.ts
 *
 * The web app's admin conversion route required a web-app session cookie
 * that the admin app couldn't provide (different cookie names). The route
 * now lives in the admin app where it authenticates via the admin session.
 *
 * Plan A1 drain #86. POST migrated to `runRoute(demoConvertContract, ...)`
 * with the handler always throwing `AppError(410, 'DEPRECATED')`. The
 * thrown error is converted to the canonical `{ error: { code, message } }`
 * envelope at status 410 by `withErrorHandler`. Message + code + status
 * preserved byte-identical to the pre-migration `NextResponse.json` body.
 *
 * The `OPTIONS` export is preserved verbatim as a plain Next.js handler —
 * the runner only dispatches by exported HTTP method name matching the
 * contract method, and we don't model `OPTIONS` in the contract.
 */
import { NextResponse } from 'next/server';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError } from '@/lib/api/errors';
import { demoConvertContract } from './contract';

export const POST = withErrorHandler(
  runRoute(demoConvertContract, async () => {
    throw new AppError(
      'This endpoint has been moved to the admin app API',
      410,
      'DEPRECATED',
    );
  }),
);

// OPTIONS preflight returns the same 410 envelope. Not handled by the runner —
// `runRoute` only dispatches by exported method name matching the contract
// method, so `OPTIONS` remains a plain Next.js export.
export async function OPTIONS() {
  return NextResponse.json(
    { error: { code: 'DEPRECATED', message: 'This endpoint has been moved to the admin app API' } },
    { status: 410 },
  );
}
