import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Every PostgREST call the route makes, answered by `respond`. */
interface Op {
  table: string;
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  terminal: 'maybeSingle' | 'many';
}
type Result = { data: unknown; error: unknown };

const ops: Op[] = [];
let respond: (op: Op) => Result;
const requirePlatformAdmin = vi.fn();

function from(table: string) {
  return {
    update: (payload: Record<string, unknown>) => {
      const op: Op = { table, payload, filters: [], terminal: 'many' };
      const run = () => {
        ops.push(op);
        return Promise.resolve(respond(op));
      };
      const chain = {
        eq: (col: string, val: unknown) => (op.filters.push([col, val]), chain),
        select: () => chain,
        maybeSingle: () => {
          op.terminal = 'maybeSingle';
          return run();
        },
        single: () => {
          // `.single()` over zero rows is a PostgREST error, not a null row.
          ops.push(op);
          const r = respond(op);
          return Promise.resolve(r.data === null ? { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } } : r);
        },
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject),
      };
      return chain;
    },
  };
}

vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminTypedClient: () => ({ from: (table: string) => from(table) }),
}));

const logAdminAction = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
  AdminAuditLogError: class AdminAuditLogError extends Error {},
}));

async function callIntervene(id: string) {
  const mod = await import('@/app/api/admin/deletion-requests/[id]/intervene/route');
  return mod.POST(new Request(`http://localhost/${id}`, { method: 'POST' }) as never, {
    params: Promise.resolve({ id }),
  });
}

const isById = (op: Op) => op.filters.some(([c]) => c === 'id');
const isByUser = (op: Op) => op.filters.some(([c]) => c === 'user_id');
const USER_ROW = { id: 42, status: 'cancelled', request_type: 'user', user_id: 'user-uuid', community_id: null };

describe('POST /api/admin/deletion-requests/[id]/intervene', () => {
  beforeEach(() => {
    ops.length = 0;
    requirePlatformAdmin.mockReset();
    requirePlatformAdmin.mockResolvedValue({ id: 'admin-1', email: 'ops@example.com' });
    respond = (op) => (isById(op) ? { data: USER_ROW, error: null } : { data: [], error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // `.single()` over zero rows returned a PostgREST error, which became a 500.
  it('returns 404, not 500, when the request is not found or no longer cooling', async () => {
    respond = () => ({ data: null, error: null });

    const response = await callIntervene('42');

    expect(response.status).toBe(404);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  // A duplicate cooling request would otherwise delete the account later.
  it("cancels every other cooling request of the user, and audits all the ids", async () => {
    respond = (op) => (isById(op) ? { data: USER_ROW, error: null } : { data: [{ id: 43 }], error: null });

    const response = await callIntervene('42');

    expect(response.status).toBe(200);
    const others = ops.find(isByUser)!;
    expect(others.payload).toMatchObject({ status: 'cancelled', cancelled_by: 'admin-1' });
    expect(others.filters).toEqual([
      ['user_id', 'user-uuid'],
      ['request_type', 'user'],
      ['status', 'cooling'],
    ]);
    const audit = logAdminAction.mock.calls[0]![0] as { newValues: Record<string, unknown> };
    expect(audit.newValues.cancelled_request_ids).toEqual([42, 43]);
  });

  it('touches no other request for a community deletion', async () => {
    respond = () => ({ data: { ...USER_ROW, request_type: 'community', user_id: 'requester', community_id: 99 }, error: null });

    const response = await callIntervene('42');

    expect(response.status).toBe(200);
    expect(ops.some(isByUser)).toBe(false);
  });

  it('reports a 500, after auditing what it did cancel, when the other requests cannot be cancelled', async () => {
    respond = (op) => (isById(op) ? { data: USER_ROW, error: null } : { data: null, error: { message: 'boom' } });

    const response = await callIntervene('42');

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('OTHER_REQUESTS_CANCEL_FAILED');
    const audit = logAdminAction.mock.calls[0]![0] as { newValues: Record<string, unknown> };
    expect(audit.newValues).toMatchObject({ cancelled_request_ids: [42], other_requests_cancel_failed: true });
  });
});
