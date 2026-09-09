import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth/platform-admin', () => ({ requirePlatformAdmin: async () => ({ id: 'u', email: 'e', role: 'super_admin' }) }));
// Typed to accept the query string (rather than `vi.fn(async () => [])`) so
// `searchAdmin(q)` below type-checks — `vi.fn`'s inferred signature is taken
// from this callback, and TS enforces call arity even though JS itself does
// not. Purely a type-level fix; the mock still just resolves to `[]`.
const searchAdmin = vi.fn(async (_q: string) => []);
vi.mock('@/lib/server/search', () => ({ searchAdmin: (q: string) => searchAdmin(q) }));
import { GET } from '@/app/api/admin/search/route';

describe('GET /api/admin/search', () => {
  it('400s an over-long query without searching', async () => {
    const res = await GET(new NextRequest('http://a/api/admin/search?q=' + 'x'.repeat(81)));
    expect(res.status).toBe(400);
    expect(searchAdmin).not.toHaveBeenCalled();
  });
  it('trims and forwards the query', async () => {
    const res = await GET(new NextRequest('http://a/api/admin/search?q=%20sunset%20'));
    expect(res.status).toBe(200);
    expect(searchAdmin).toHaveBeenCalledWith('sunset');
  });
});
