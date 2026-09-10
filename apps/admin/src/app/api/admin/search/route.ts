/**
 * GET /api/admin/search — the ⌘K command palette's single search endpoint.
 *
 * This reads cross-tenant data through the service-role client (see the
 * individual searchers in `lib/server/search/`), so `requirePlatformAdmin()`
 * MUST run before any data is read — it is the only thing standing between
 * an anonymous request and every tenant's data.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { withAdminErrorHandler } from '@/lib/api/with-error-handler';
import { requirePlatformAdmin } from '@/lib/auth/platform-admin';
import { parseAdminQuery } from '@/lib/api/parse-body';
import { searchAdmin } from '@/lib/server/search';

export const dynamic = 'force-dynamic';

// Kept as a local literal rather than imported from `@/lib/server/search`:
// this route's unit test mocks that module down to just `searchAdmin`, and an
// import of a second named export would throw against that mock. The value
// must still match `MAX_QUERY_LENGTH` in `lib/server/search.ts`.
const MAX_QUERY_LENGTH = 80;

export const GET = withAdminErrorHandler(async (request: NextRequest) => {
  await requirePlatformAdmin();

  const rawQ = request.nextUrl.searchParams.get('q') ?? '';
  const parsed = parseAdminQuery(rawQ, z.string().max(MAX_QUERY_LENGTH), 'q');
  if (parsed instanceof NextResponse) return parsed;

  const data = await searchAdmin(parsed.trim());
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } });
});
