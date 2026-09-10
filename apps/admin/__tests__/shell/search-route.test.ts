import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';
// A vi.fn(), not a hard-mocked always-succeeds async function: the gate test
// below needs to make this REJECT for one call, which a bare
// `async () => ({...})` mock can never do. Following signals-route.test.ts's
// shape.
const requirePlatformAdmin = vi.fn();
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: () => requirePlatformAdmin() }));
// Typed to accept the query string (rather than `vi.fn(async () => [])`) so
// `searchAdmin(q)` below type-checks — `vi.fn`'s inferred signature is taken
// from this callback, and TS enforces call arity even though JS itself does
// not. Purely a type-level fix; the mock still just resolves to `[]`.
const searchAdmin = vi.fn(async (_q: string) => []);
vi.mock('@/lib/server/search', () => ({ searchAdmin: (q: string) => searchAdmin(q) }));
import { GET } from '@/app/api/admin/search/route';

describe('GET /api/admin/search', () => {
  // Each test's `.not.toHaveBeenCalled()` / `.toHaveBeenCalledWith()`
  // assertion must reflect only that test's own call to `searchAdmin` — not
  // a call left over from a sibling test's mock state.
  beforeEach(() => {
    requirePlatformAdmin.mockReset();
    searchAdmin.mockClear();
  });

  it('401s an anonymous caller before touching any data', async () => {
    // This is the negative case the gate needs: search-route.test.ts used to
    // hard-mock requirePlatformAdmin to always succeed and never assert it
    // ran, so deleting `await requirePlatformAdmin();` in the route would not
    // redden this suite even though it removes the only thing standing
    // between an anonymous request and every tenant's data. See
    // signals-route.test.ts, which already had this test.
    requirePlatformAdmin.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(new NextRequest('http://a/api/admin/search?q=sunset'));
    expect(res.status).toBe(401);
    expect(searchAdmin).not.toHaveBeenCalled();
  });
  it('400s an over-long query without searching', async () => {
    requirePlatformAdmin.mockResolvedValueOnce({ id: 'u', email: 'e', role: 'super_admin' });
    const res = await GET(new NextRequest('http://a/api/admin/search?q=' + 'x'.repeat(81)));
    expect(res.status).toBe(400);
    expect(searchAdmin).not.toHaveBeenCalled();
  });
  it('trims and forwards the query', async () => {
    requirePlatformAdmin.mockResolvedValueOnce({ id: 'u', email: 'e', role: 'super_admin' });
    const res = await GET(new NextRequest('http://a/api/admin/search?q=%20sunset%20'));
    expect(res.status).toBe(200);
    expect(searchAdmin).toHaveBeenCalledWith('sunset');
  });
});
