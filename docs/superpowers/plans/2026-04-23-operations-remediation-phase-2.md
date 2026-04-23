# Operations Hub Remediation — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Operations hub into a real workspace: three inline creation drawers (Request / Work Order / Reservation) controlled by a `?create=` URL contract, a contextual CTA per tab that fixes the "Submit Request on Reservations" bug, reservations merged into the "All" feed as a third cursor source, and real page-based pagination on Work Orders and Reservations APIs replacing Phase 1's "Showing N results" footer. One rollback flag (`OPERATIONS_HUB_CREATE_SHEETS=off`) reverts CTAs to Phase 1 `<Link>` forms while keeping Phase 1 routing, feed-merge, and pagination live.

**Architecture:** Three shadcn `Sheet`-based components (`<RequestCreateSheet>`, `<WorkOrderCreateSheet>`, `<ReservationCreateSheet>`) share a `<FormDrawer>` container; all three mount on the Operations hub and open/close via `?create=(request|work-order|reservation)`. The hub computes CTA per tab+role+features and emits a router.replace that sets `?create=`. `operations-service.ts` extends `OperationsSourceType` to `'maintenance_request' | 'work_order' | 'reservation'` with a cursor discriminator that stays backward-compatible with Phase 1 cursors. `GET /api/v1/work-orders` and `GET /api/v1/reservations` gain `page`/`limit`/`total` pagination; the hub's Load More switches from "Showing N" footer to cursor on `all` and `page+1` on every other tab.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Testing Library, shadcn/ui Sheet (`@radix-ui/react-dialog`), TanStack Query, Drizzle ORM, Zod. No new dependencies.

**Reference spec:** [docs/superpowers/specs/2026-04-22-operations-remediation-design.md](../specs/2026-04-22-operations-remediation-design.md) §5.

**Depends on:** Phase 1 merged ([docs/superpowers/plans/2026-04-22-operations-remediation-phase-1.md](2026-04-22-operations-remediation-phase-1.md), PR #130). Phase 2 assumes the canonical route builder, plan-gating unification, redirect pages, and Load More on `all`/`requests` are already live.

**Out of scope for Phase 2** (deferred to follow-ups, not this plan):
- Vendor directory / vendor creation UI — `<WorkOrderCreateSheet>` uses the existing `GET /api/v1/vendors` endpoint. Creating vendors from the drawer is follow-up.
- Server-side amenity double-booking prevention — Reservation sheet uses existing `GET /api/v1/amenities/[id]/schedule` as a client-side UX hint only.
- Drill-down detail routes for `/maintenance/requests/[id]`, `/work-orders/[id]`, `/reservations/[id]`, `/amenities/[id]` — none exist today. Hub cards do not link in Phase 1; Phase 2 keeps that behavior. Building detail routes is follow-up.
- Bulk actions.
- Inline filter UI (chips/dropdowns).
- Reservation edit from the hub (cancel already exists via `useCancelReservation`; unchanged).
- The remaining ~15 `getFeaturesForCommunity` call sites outside the operations surface.
- Spec §5.1 overflow secondary CTA on the "All" tab for admins ("Submit Request" as an overflow item beside the primary "Dispatch Work Order"). Phase 2 ships only the primary CTA per tab; secondary/overflow is a small follow-up that needs a dropdown primitive decision (shadcn `DropdownMenu` vs. a simple secondary button).

**Verification performed pre-plan (findings that shape the tasks):**
1. `GET /api/v1/vendors` exists at [apps/web/src/app/api/v1/vendors/route.ts](../../../apps/web/src/app/api/v1/vendors/route.ts) and returns `{ data: Vendor[] }`. → Work-order sheet ships with a real vendor picker (not "assign later").
2. No `[id]/page.tsx` detail routes exist for maintenance-requests, work-orders, reservations, or amenities. → Phase 2 does not add entity links to hub cards; any linking is follow-up.
3. `membership.isAdmin` is already exposed on `CommunityMembership` (via `requireWorkOrderAdminWrite` at [work-orders/common.ts:38](../../../apps/web/src/lib/work-orders/common.ts:38)). → CTA logic uses `isAdmin` + `requestScope` directly; no new role introspection needed.
4. shadcn `Sheet` exists at [apps/web/src/components/ui/sheet.tsx](../../../apps/web/src/components/ui/sheet.tsx). → Phase 2 reuses, no new primitive.
5. `OperationsHub` currently receives `requestActionHref` / `requestActionLabel` props from [operations/page.tsx:53-56](../../../apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx:53). Phase 2 removes both props. Three test call sites in [operations-hub.test.tsx](../../../apps/web/__tests__/components/operations/operations-hub.test.tsx) pass these props; all need updating.

---

## File Structure

**New files (Phase 2):**
- `apps/web/src/components/operations/FormDrawer.tsx` — shared Sheet container with header/footer/error row.
- `apps/web/src/components/operations/RequestCreateSheet.tsx` — wraps `SubmitForm`.
- `apps/web/src/components/operations/WorkOrderCreateSheet.tsx` — new, admin-only.
- `apps/web/src/components/operations/ReservationCreateSheet.tsx` — new.
- `apps/web/src/components/operations/__tests__/FormDrawer.test.tsx`
- `apps/web/src/components/operations/__tests__/RequestCreateSheet.test.tsx`
- `apps/web/src/components/operations/__tests__/WorkOrderCreateSheet.test.tsx`
- `apps/web/src/components/operations/__tests__/ReservationCreateSheet.test.tsx`
- `apps/web/src/hooks/__tests__/use-operations-mutations.test.ts`
- `apps/web/src/hooks/__tests__/use-vendors.test.ts`
- `apps/web/__tests__/lib/services/operations-service-reservations.test.ts` — reservations merge + cursor backward compat.
- `apps/web/__tests__/lib/services/work-orders-service-pagination.test.ts` — page-based listing.

**Modified files (Phase 2):**
- `apps/web/src/lib/services/operations-service.ts` — extend `OperationsSourceType`, add `fetchReservationRows`, update cursor discriminator, extend `SOURCE_ORDER`.
- `apps/web/src/app/api/v1/operations/route.ts` — extend `type` enum to include `'reservation'`.
- `apps/web/src/lib/services/work-orders-service.ts` — `listWorkOrdersForCommunity` accepts `page`/`limit`, returns `{ data, total }`. `listReservationsForCommunity` added (admin-scoped; distinct from `listReservationsForActor`).
- `apps/web/src/app/api/v1/work-orders/route.ts` GET — accept `page`/`limit`, return `{ data, meta: { page, limit, total } }`.
- `apps/web/src/app/api/v1/reservations/route.ts` GET — accept `page`/`limit`, return `{ data, meta }`. Keep actor-scoped behavior for residents; admins see community.
- `apps/web/src/hooks/use-operations.ts` — extend `OperationsSourceType` union, extend `WorkOrderListResponse` + `ReservationListResponse` to `{ data, meta }`, add `useCreateMaintenanceRequest`, `useCreateWorkOrder`, `useCreateReservation`, `useVendors`.
- `apps/web/src/components/operations/operations-hub.tsx` — compute contextual CTA, drop `requestActionHref`/`requestActionLabel` props, mount three sheets, read `?create=` param, consume paginated hook shapes, remove "Showing N" footers, rollback-flag branch.
- `apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx` — drop request-action prop construction, pass `role` + `isAdmin`.
- `apps/web/__tests__/components/operations/operations-hub.test.tsx` — rewrite the three tests that pin the wrong CTA (lines ~89–127, ~129–185, ~187–213).
- `apps/web/src/hooks/__tests__/use-operations.test.ts` — extend for new hook shapes.
- `apps/web/__tests__/operations/route.test.ts` — extend for `type=reservation` filter.
- `apps/web/src/lib/operations/routes.ts` — no change (already canonical in Phase 1).

---

## Task 1 — Extend `OperationsSourceType` and cursor to 3 sources (backward-compatible)

**Files:**
- Modify: `apps/web/src/lib/services/operations-service.ts`
- Create: `apps/web/__tests__/lib/services/operations-service-reservations.test.ts`

Phase 1 cursors use `type: 'maintenance_request' | 'work_order'`. Phase 2 extends the union. The discriminator in `decodeCursor` currently throws on any unknown `type`. We relax it to accept `'reservation'` while keeping old payloads decodable.

- [ ] **Step 1.1: Write failing test — legacy Phase 1 cursors still decode, new type round-trips**

Create `apps/web/__tests__/lib/services/operations-service-reservations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { encodeOperationsCursorForTests } from '@/lib/services/operations-service';

describe('operations-service cursor compat', () => {
  it('decodes a legacy Phase 1 cursor (maintenance_request)', () => {
    // Phase 1 encoded cursors used the same base64url + JSON format.
    // Simulate: encode using the current helper but with a type that was valid in Phase 1.
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 42,
      type: 'maintenance_request',
    });
    expect(typeof cursor).toBe('string');
    // Decoding happens implicitly inside listOperationsForCommunity; we assert
    // round-trip here as the contract guarantee.
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    expect(decoded.type).toBe('maintenance_request');
  });

  it('decodes a legacy Phase 1 cursor (work_order)', () => {
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 77,
      type: 'work_order',
    });
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    expect(decoded.type).toBe('work_order');
  });

  it('round-trips the new reservation cursor type', () => {
    const cursor = encodeOperationsCursorForTests({
      createdAt: '2026-04-01T12:00:00.000Z',
      id: 9,
      type: 'reservation',
    });
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    expect(decoded.type).toBe('reservation');
    expect(decoded.id).toBe(9);
  });
});
```

- [ ] **Step 1.2: Run the test to confirm it fails**

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/operations-service-reservations.test.ts`

Expected: the first two pass, the third FAILs with a TypeScript error on the `'reservation'` literal (the `OperationsCursorPayload.type` union is `maintenance_request | work_order` only).

- [ ] **Step 1.3: Extend the type union and source ordering**

Modify `apps/web/src/lib/services/operations-service.ts`.

Replace the type alias near the top of the file (around line 9):

```ts
// BEFORE
export type OperationsSourceType = 'maintenance_request' | 'work_order';

// AFTER
export type OperationsSourceType = 'maintenance_request' | 'work_order' | 'reservation';
```

Extend `SOURCE_ORDER` (around line 59):

```ts
// BEFORE
const SOURCE_ORDER: Record<OperationsSourceType, number> = {
  maintenance_request: 0,
  work_order: 1,
};

// AFTER
const SOURCE_ORDER: Record<OperationsSourceType, number> = {
  maintenance_request: 0,
  work_order: 1,
  reservation: 2,
};
```

Extend the `decodeCursor` type guard (around line 72):

```ts
// BEFORE
if (
  typeof decoded.createdAt !== 'string' ||
  typeof decoded.id !== 'number' ||
  (decoded.type !== 'maintenance_request' && decoded.type !== 'work_order')
) {
  throw new Error('Invalid cursor');
}

// AFTER
if (
  typeof decoded.createdAt !== 'string' ||
  typeof decoded.id !== 'number' ||
  (decoded.type !== 'maintenance_request'
    && decoded.type !== 'work_order'
    && decoded.type !== 'reservation')
) {
  throw new Error('Invalid cursor');
}
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/operations-service-reservations.test.ts`

Expected: all three cases PASS.

- [ ] **Step 1.5: Run typecheck and full unit suite**

Run: `pnpm typecheck`

Expected: no errors. The union extension is additive — existing callers that branch on `type === 'maintenance_request'` etc. still compile; any exhaustive switch statement will surface as a compile error for Step 1.6.

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/ apps/web/__tests__/operations/`

Expected: PASS.

- [ ] **Step 1.6: Commit**

```bash
git add apps/web/src/lib/services/operations-service.ts \
        apps/web/__tests__/lib/services/operations-service-reservations.test.ts
git commit -m "feat(operations): extend cursor discriminator to reservation source"
```

---

## Task 2 — Merge reservations into the "All" feed

**Files:**
- Modify: `apps/web/src/lib/services/operations-service.ts`
- Modify: `apps/web/__tests__/lib/services/operations-service-reservations.test.ts`

Add a third `fetchSourceRows` branch for reservations. Reservations lack a `priority` field — synthesize `'normal'`. Status is the literal `'confirmed' | 'cancelled'`. The title is `"Reservation — <amenity name>"` via a LEFT JOIN on the amenities table; if the amenity is missing (soft-deleted), fall back to `"Reservation"`.

- [ ] **Step 2.1: Write failing test — reservations appear in merged feed with correct title and SOURCE_ORDER**

Append to `apps/web/__tests__/lib/services/operations-service-reservations.test.ts`:

```ts
import { vi } from 'vitest';
import { listOperationsForCommunity } from '@/lib/services/operations-service';

vi.mock('@propertypro/db', async () => {
  // Minimal scoped-client stub: the service calls scoped.selectFrom(...).orderBy(...).limit(n).
  // We return a builder whose terminal `.limit(n)` returns a preset result per table.
  const tableFixtures = new Map<string, Array<Record<string, unknown>>>();
  const stubBuilder = (rows: Array<Record<string, unknown>>) => ({
    orderBy: () => ({ limit: () => Promise.resolve(rows) }),
  });
  return {
    createScopedClient: () => ({
      selectFrom: (table: { _tableName?: string }) => {
        const name = table._tableName ?? 'unknown';
        return stubBuilder(tableFixtures.get(name) ?? []);
      },
    }),
    __setTableFixture: (name: string, rows: Array<Record<string, unknown>>) => {
      tableFixtures.set(name, rows);
    },
    maintenanceRequests: { _tableName: 'maintenance_requests', id: 'id', title: 'title', status: 'status', priority: 'priority', unitId: 'unitId', createdAt: 'createdAt' },
    workOrders: { _tableName: 'work_orders', id: 'id', title: 'title', status: 'status', priority: 'priority', unitId: 'unitId', createdAt: 'createdAt' },
    amenityReservations: { _tableName: 'amenity_reservations', id: 'id', amenityId: 'amenityId', status: 'status', unitId: 'unitId', createdAt: 'createdAt', startTime: 'startTime' },
    amenities: { _tableName: 'amenities', id: 'id', name: 'name' },
  };
});

vi.mock('@propertypro/db/filters', () => ({
  and: (..._args: unknown[]) => ({ _type: 'and' }),
  or: (..._args: unknown[]) => ({ _type: 'or' }),
  eq: (..._args: unknown[]) => ({ _type: 'eq' }),
  lt: (..._args: unknown[]) => ({ _type: 'lt' }),
  lte: (..._args: unknown[]) => ({ _type: 'lte' }),
  desc: (col: unknown) => ({ _type: 'desc', col }),
}));

describe('listOperationsForCommunity — reservations merge', () => {
  it('includes reservations in the merged feed with "Reservation — <amenity>" title', async () => {
    const db = await import('@propertypro/db') as unknown as { __setTableFixture: (name: string, rows: Array<Record<string, unknown>>) => void };
    db.__setTableFixture('maintenance_requests', []);
    db.__setTableFixture('work_orders', []);
    db.__setTableFixture('amenity_reservations', [
      {
        id: 9,
        title: 'Reservation — Pool',
        status: 'confirmed',
        priority: 'normal',
        unitId: 3,
        createdAt: new Date('2026-04-10T12:00:00Z'),
      },
    ]);

    const res = await listOperationsForCommunity(42);
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      id: 9,
      type: 'reservation',
      title: 'Reservation — Pool',
      status: 'confirmed',
      priority: 'normal',
    });
  });
});
```

- [ ] **Step 2.2: Run the test — expect FAIL**

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/operations-service-reservations.test.ts`

Expected: the new "reservations merge" test FAILs because `listOperationsForCommunity` does not yet query the reservations source.

- [ ] **Step 2.3: Implement the reservation fetch path**

In `apps/web/src/lib/services/operations-service.ts`, add imports for `amenityReservations` and `amenities`. Update imports:

```ts
// BEFORE
import {
  createScopedClient,
  maintenanceRequests,
  workOrders,
} from '@propertypro/db';

// AFTER
import {
  amenities,
  amenityReservations,
  createScopedClient,
  maintenanceRequests,
  workOrders,
} from '@propertypro/db';
```

Extend `fetchSourceRows` (around line 146) to branch on `'reservation'`. Replace the function with this version:

```ts
async function fetchSourceRows(
  communityId: number,
  sourceType: OperationsSourceType,
  params: OperationsListParams,
): Promise<OperationSummaryRecord[]> {
  const scoped = createScopedClient(communityId);
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT) + 1;
  const cursor = params.cursor ? decodeCursor(params.cursor) : null;
  const filters: unknown[] = [];

  if (sourceType === 'reservation') {
    if (params.unitId != null) {
      filters.push(eq(amenityReservations.unitId, params.unitId));
    }
    // Reservations have no `priority`; ignore that filter. Status passes through.
    if (params.status) {
      filters.push(eq(amenityReservations.status, params.status as never));
    }
    if (cursor) {
      filters.push(
        buildCursorFilter(
          sourceType,
          cursor,
          amenityReservations.createdAt,
          amenityReservations.id,
        ),
      );
    }
    const where = filters.length > 0 ? and(...(filters as [never, ...never[]])) : undefined;
    const rows = await scoped
      .selectFrom<OperationSummaryRecord>(
        amenityReservations,
        {
          id: amenityReservations.id,
          // Title synthesized inline — the list endpoint doesn't need to JOIN.
          // We fetch amenity name separately only when needed (see note below).
          title: amenityReservations.id, // placeholder; overwritten in mapReservationRow
          status: amenityReservations.status,
          priority: amenityReservations.id, // synthesized later
          unitId: amenityReservations.unitId,
          createdAt: amenityReservations.createdAt,
          amenityId: amenityReservations.amenityId,
        },
        where as never,
      )
      .orderBy(desc(amenityReservations.createdAt), desc(amenityReservations.id))
      .limit(limit);
    return rows as OperationSummaryRecord[];
  }

  // Existing maintenance_request / work_order paths unchanged:
  if (params.status) {
    filters.push(
      sourceType === 'maintenance_request'
        ? eq(maintenanceRequests.status, params.status as never)
        : eq(workOrders.status, params.status as never),
    );
  }
  if (params.priority) {
    filters.push(
      sourceType === 'maintenance_request'
        ? eq(maintenanceRequests.priority, params.priority as never)
        : eq(workOrders.priority, params.priority as never),
    );
  }
  if (params.unitId != null) {
    filters.push(
      sourceType === 'maintenance_request'
        ? eq(maintenanceRequests.unitId, params.unitId)
        : eq(workOrders.unitId, params.unitId),
    );
  }
  if (cursor) {
    filters.push(
      buildCursorFilter(
        sourceType,
        cursor,
        sourceType === 'maintenance_request' ? maintenanceRequests.createdAt : workOrders.createdAt,
        sourceType === 'maintenance_request' ? maintenanceRequests.id : workOrders.id,
      ),
    );
  }
  const where = filters.length > 0 ? and(...(filters as [never, ...never[]])) : undefined;
  const table = sourceType === 'maintenance_request' ? maintenanceRequests : workOrders;
  const rows = await scoped
    .selectFrom<OperationSummaryRecord>(
      table,
      {
        id: table.id,
        title: table.title,
        status: table.status,
        priority: table.priority,
        unitId: table.unitId,
        createdAt: table.createdAt,
      },
      where as never,
    )
    .orderBy(desc(table.createdAt), desc(table.id))
    .limit(limit);
  return rows as OperationSummaryRecord[];
}
```

Add a title resolver for reservations. After the fetch, we need amenity names. Add this helper near `mapSummaryRow`:

```ts
async function attachReservationTitles(
  communityId: number,
  rows: OperationSummaryRecord[],
): Promise<OperationSummaryRecord[]> {
  const amenityIds = Array.from(
    new Set(
      rows
        .map((row) => (row as unknown as { amenityId?: number }).amenityId)
        .filter((id): id is number => typeof id === 'number'),
    ),
  );
  if (amenityIds.length === 0) return rows;

  const scoped = createScopedClient(communityId);
  const amenityRows = await scoped
    .selectFrom<{ id: number; name: string }>(
      amenities,
      { id: amenities.id, name: amenities.name },
      // No additional filter — tenant scope is applied by createScopedClient.
    )
    .orderBy(desc(amenities.id));

  const nameById = new Map<number, string>();
  for (const amenity of amenityRows) {
    if (amenityIds.includes(amenity.id)) nameById.set(amenity.id, amenity.name);
  }

  return rows.map((row) => {
    const amenityId = (row as unknown as { amenityId?: number }).amenityId;
    const amenityName = typeof amenityId === 'number' ? nameById.get(amenityId) : undefined;
    return {
      ...row,
      title: amenityName ? `Reservation — ${amenityName}` : 'Reservation',
      priority: 'normal',
    };
  });
}
```

Update `listOperationsForCommunity` to include `'reservation'` in the default source list and to apply `attachReservationTitles`. Replace the `sources` line (around line 219) and add the title attachment after the `settled.forEach`:

```ts
// BEFORE
const sources: OperationsSourceType[] = params.type ? [params.type] : ['maintenance_request', 'work_order'];

// AFTER
const sources: OperationsSourceType[] = params.type
  ? [params.type]
  : ['maintenance_request', 'work_order', 'reservation'];
```

In the aggregation block (around line 240-243), split the reservation rows out for title attachment. Replace the forEach + sort section with:

```ts
const unavailableSources: OperationsSourceType[] = [];
const rawItemsByType = new Map<OperationsSourceType, OperationSummaryRecord[]>();

settled.forEach((result, index) => {
  const sourceType = sources[index]!;
  if (result.status === 'rejected') {
    unavailableSources.push(sourceType);
    return;
  }
  rawItemsByType.set(sourceType, result.value);
});

// Attach amenity names only to reservation rows (bounded extra query, same tenant).
const reservationRows = rawItemsByType.get('reservation');
if (reservationRows && reservationRows.length > 0) {
  rawItemsByType.set('reservation', await attachReservationTitles(communityId, reservationRows));
}

const items: OperationsListItem[] = [];
for (const [sourceType, rows] of rawItemsByType.entries()) {
  for (const row of rows.slice(0, (params.limit ?? DEFAULT_LIMIT) + 1)) {
    items.push(mapSummaryRow(sourceType, row));
  }
}
```

The existing `items.sort(...)` and cursor-emission blocks below stay unchanged.

- [ ] **Step 2.4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/operations-service-reservations.test.ts`

Expected: all cases PASS, including the new merge case.

- [ ] **Step 2.5: Run the full operations test suite and typecheck**

Run: `pnpm typecheck`

Run: `pnpm exec vitest run apps/web/__tests__/operations/ apps/web/__tests__/lib/services/`

Expected: PASS. Phase 1 operations tests still pass (partial-failure, 503 when all sources unavailable) — reservations is additive.

- [ ] **Step 2.6: Commit**

```bash
git add apps/web/src/lib/services/operations-service.ts \
        apps/web/__tests__/lib/services/operations-service-reservations.test.ts
git commit -m "feat(operations): merge reservations into All feed as third source"
```

---

## Task 3 — `GET /api/v1/operations` accepts `type=reservation`

**Files:**
- Modify: `apps/web/src/app/api/v1/operations/route.ts`
- Modify: `apps/web/__tests__/operations/route.test.ts`

Phase 1 zod enum is `['maintenance_request', 'work_order']`. Add `'reservation'` so the client can ask for a single source.

- [ ] **Step 3.1: Write failing test**

Append to `apps/web/__tests__/operations/route.test.ts` (after the existing `describe` body, inside the same block):

```ts
  it('accepts type=reservation and forwards it to listOperationsForCommunity', async () => {
    listOperationsForCommunityMock.mockResolvedValue({
      data: [
        {
          id: 9,
          type: 'reservation',
          title: 'Reservation — Pool',
          status: 'confirmed',
          priority: 'normal',
          unitId: 3,
          createdAt: '2026-04-10T12:00:00.000Z',
        },
      ],
      meta: { cursor: null, limit: 25, partialFailure: false, unavailableSources: [] },
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/operations?communityId=42&limit=25&type=reservation'),
    );

    expect(res.status).toBe(200);
    expect(listOperationsForCommunityMock).toHaveBeenCalledWith(42, expect.objectContaining({
      type: 'reservation',
    }));
  });
```

- [ ] **Step 3.2: Run — expect FAIL**

Run: `pnpm exec vitest run apps/web/__tests__/operations/route.test.ts`

Expected: new case fails with a 400 ValidationError because the zod enum rejects `'reservation'`.

- [ ] **Step 3.3: Extend the zod enum**

In `apps/web/src/app/api/v1/operations/route.ts` (around line 16):

```ts
// BEFORE
type: z.enum(['maintenance_request', 'work_order']).optional(),

// AFTER
type: z.enum(['maintenance_request', 'work_order', 'reservation']).optional(),
```

- [ ] **Step 3.4: Run — expect PASS**

Run: `pnpm exec vitest run apps/web/__tests__/operations/route.test.ts`

Expected: all cases PASS.

- [ ] **Step 3.5: Commit**

```bash
git add apps/web/src/app/api/v1/operations/route.ts apps/web/__tests__/operations/route.test.ts
git commit -m "feat(operations): operations API accepts type=reservation filter"
```

---

## Task 4 — Work Orders API: page-based pagination

**Files:**
- Modify: `apps/web/src/lib/services/work-orders-service.ts`
- Modify: `apps/web/src/app/api/v1/work-orders/route.ts`
- Create: `apps/web/__tests__/lib/services/work-orders-service-pagination.test.ts`

`listWorkOrdersForCommunity` currently returns an unbounded array. Phase 2 adds optional `page` and `limit` params and returns `{ data, total }`. The route wraps this in `{ data, meta: { page, limit, total } }`.

- [ ] **Step 4.1: Write failing test for service-level pagination**

Create `apps/web/__tests__/lib/services/work-orders-service-pagination.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@propertypro/db', async () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({
    id: i + 1,
    communityId: 42,
    title: `WO ${i + 1}`,
    description: null,
    unitId: null,
    vendorId: null,
    priority: 'medium',
    status: 'created',
    slaResponseHours: null,
    slaCompletionHours: null,
    assignedAt: null,
    startedAt: null,
    completedAt: null,
    closedAt: null,
    notes: null,
    createdAt: new Date(Date.now() - i * 1000),
    updatedAt: new Date(Date.now() - i * 1000),
    assignedByUserId: null,
    completedByUserId: null,
  }));

  return {
    createScopedClient: () => ({
      selectFrom: () => ({
        orderBy: () => ({
          limit: (n: number) => ({
            offset: (o: number) => Promise.resolve(rows.slice(o, o + n)),
          }),
        }),
      }),
      countFrom: () => Promise.resolve(45),
    }),
    workOrders: { id: 'id', status: 'status', unitId: 'unitId', createdAt: 'createdAt' },
  };
});

vi.mock('@propertypro/db/filters', () => ({
  and: () => ({ _type: 'and' }),
  eq: () => ({ _type: 'eq' }),
  inArray: () => ({ _type: 'inArray' }),
  desc: (col: unknown) => ({ _type: 'desc', col }),
}));

import { listWorkOrdersForCommunity } from '@/lib/services/work-orders-service';

describe('listWorkOrdersForCommunity — pagination', () => {
  it('returns { data, total } with default page=1, limit=20', async () => {
    const res = await listWorkOrdersForCommunity(42, {});
    expect(res.total).toBe(45);
    expect(res.data).toHaveLength(20);
    expect(res.data[0]!.id).toBe(1);
  });

  it('honors page=2 with limit=20', async () => {
    const res = await listWorkOrdersForCommunity(42, { page: 2, limit: 20 });
    expect(res.total).toBe(45);
    expect(res.data).toHaveLength(20);
    expect(res.data[0]!.id).toBe(21);
  });

  it('caps limit at 100', async () => {
    const res = await listWorkOrdersForCommunity(42, { page: 1, limit: 500 });
    expect(res.data.length).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 4.2: Run — expect FAIL**

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/work-orders-service-pagination.test.ts`

Expected: FAILs — `listWorkOrdersForCommunity` currently returns a raw array, not `{ data, total }`.

- [ ] **Step 4.3: Implement pagination in the service**

In `apps/web/src/lib/services/work-orders-service.ts`, locate `listWorkOrdersForCommunity` (around line 397). Replace with:

```ts
export interface PaginatedWorkOrders {
  data: Array<WorkOrderRecord & { responseSlaBreached: boolean; completionSlaBreached: boolean }>;
  total: number;
}

export async function listWorkOrdersForCommunity(
  communityId: number,
  filters?: {
    status?: WorkOrderStatus;
    unitId?: number;
    allowedUnitIds?: number[];
    page?: number;
    limit?: number;
  },
): Promise<PaginatedWorkOrders> {
  const scoped = createScopedClient(communityId);
  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(Math.max(1, filters?.limit ?? 20), 100);
  const offset = (page - 1) * limit;
  const whereFilters = [];

  if (filters?.status) {
    whereFilters.push(eq(workOrders.status, filters.status));
  }
  if (filters?.unitId !== undefined) {
    whereFilters.push(eq(workOrders.unitId, filters.unitId));
  }
  if (filters?.allowedUnitIds) {
    if (filters.allowedUnitIds.length === 0) {
      return { data: [], total: 0 };
    }
    whereFilters.push(inArray(workOrders.unitId, filters.allowedUnitIds));
  }

  const where = whereFilters.length > 0 ? and(...whereFilters) : undefined;

  const rows = await scoped
    .selectFrom<WorkOrderRecord>(workOrders, {}, where as never)
    .orderBy(desc(workOrders.createdAt))
    .limit(limit)
    .offset(offset);

  const total = await scoped.countFrom(workOrders, where as never);

  const data = rows.map((row) => {
    const mapped = mapWorkOrderRow(row);
    return { ...mapped, ...deriveSlaState(mapped) };
  });

  return { data, total };
}
```

Note: `scoped.countFrom(table, where)` is the existing scoped-client count helper. If the helper lacks a `where` overload, use the same pattern used elsewhere in this service (grep for `countFrom` — use the matching call shape). If no count helper exists, run `const total = (await scoped.selectFrom(workOrders, { id: workOrders.id }, where as never)).length;` as a fallback and note the TODO in the commit message.

- [ ] **Step 4.4: Update the `GET /api/v1/work-orders` route to return `{ data, meta }`**

In `apps/web/src/app/api/v1/work-orders/route.ts`, replace the GET handler (lines 37-86). Specifically, replace the param parsing and response shape:

```ts
// AFTER the existing `const rawUnitId = searchParams.get('unitId');` line, add:
const rawPage = searchParams.get('page');
const rawLimit = searchParams.get('limit');
const page = rawPage ? Math.max(1, parsePositiveInt(rawPage, 'page')) : 1;
const limit = rawLimit ? Math.min(Math.max(1, parsePositiveInt(rawLimit, 'limit')), 100) : 20;
```

Then pass `page` and `limit` into `listWorkOrdersForCommunity`:

```ts
const { data, total } = await listWorkOrdersForCommunity(communityId, {
  status,
  unitId,
  allowedUnitIds,
  page,
  limit,
});

return NextResponse.json({ data, meta: { page, limit, total } });
```

- [ ] **Step 4.5: Update any callers that rely on the old array shape**

Run: `grep -rn "listWorkOrdersForCommunity" apps/web/src --include='*.ts' --include='*.tsx'`

For each caller that deconstructs the old return value, update to `const { data } = await listWorkOrdersForCommunity(...)`. Expected callers: only the route handler we just updated. If other callers exist (PM reports, exports), update those too and re-run typecheck.

- [ ] **Step 4.6: Run tests + typecheck**

Run: `pnpm typecheck`

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/work-orders-service-pagination.test.ts apps/web/__tests__/integration/work-orders-amenities.integration.test.ts`

Expected: PASS. Integration test either skips (no DB) or passes against the new shape. If the integration test expects the old array shape, update its assertion to read `.data`.

- [ ] **Step 4.7: Commit**

```bash
git add apps/web/src/lib/services/work-orders-service.ts \
        apps/web/src/app/api/v1/work-orders/route.ts \
        apps/web/__tests__/lib/services/work-orders-service-pagination.test.ts
git commit -m "feat(operations): work-orders API page-based pagination"
```

---

## Task 5 — Reservations API: page-based pagination + admin-scoped list

**Files:**
- Modify: `apps/web/src/lib/services/work-orders-service.ts`
- Modify: `apps/web/src/app/api/v1/reservations/route.ts`

Phase 1's `listReservationsForActor(communityId, actorUserId)` returns only the actor's own reservations. Admins need the whole community feed. Add `listReservationsForCommunity(communityId, { page, limit, unitId?, status?, allowedUnitIds? })`. Keep `listReservationsForActor` unchanged — existing callers still use it.

- [ ] **Step 5.1: Write failing test for admin-scoped list**

Append to `apps/web/__tests__/lib/services/work-orders-service-pagination.test.ts`:

```ts
// Mock reset: reservation fixtures.
vi.mock('@propertypro/db', async () => {
  const wRows = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1, communityId: 42, title: `WO ${i}`, description: null, unitId: null,
    vendorId: null, priority: 'medium' as const, status: 'created' as const,
    slaResponseHours: null, slaCompletionHours: null,
    assignedAt: null, startedAt: null, completedAt: null, closedAt: null, notes: null,
    createdAt: new Date(), updatedAt: new Date(),
    assignedByUserId: null, completedByUserId: null,
  }));
  const rRows = Array.from({ length: 33 }, (_, i) => ({
    id: i + 1, communityId: 42, amenityId: 1, userId: 'u-1', unitId: null,
    startTime: new Date(), endTime: new Date(), status: 'confirmed' as const,
    notes: null, createdAt: new Date(Date.now() - i * 1000), updatedAt: new Date(),
    deletedAt: null,
  }));

  return {
    createScopedClient: () => ({
      selectFrom: (table: { _type?: string }) => ({
        orderBy: () => ({
          limit: (n: number) => ({
            offset: (o: number) => Promise.resolve(
              (table._type === 'reservations' ? rRows : wRows).slice(o, o + n),
            ),
          }),
        }),
      }),
      countFrom: (table: { _type?: string }) => Promise.resolve(
        table._type === 'reservations' ? 33 : 10,
      ),
    }),
    workOrders: { _type: 'work_orders', id: 'id', status: 'status', unitId: 'unitId', createdAt: 'createdAt' },
    amenityReservations: { _type: 'reservations', id: 'id', status: 'status', unitId: 'unitId', startTime: 'startTime', createdAt: 'createdAt' },
  };
});

import { listReservationsForCommunity } from '@/lib/services/work-orders-service';

describe('listReservationsForCommunity — pagination', () => {
  it('returns { data, total } page=1 default limit=20', async () => {
    const res = await listReservationsForCommunity(42, {});
    expect(res.total).toBe(33);
    expect(res.data).toHaveLength(20);
  });

  it('honors page=2', async () => {
    const res = await listReservationsForCommunity(42, { page: 2, limit: 20 });
    expect(res.total).toBe(33);
    expect(res.data).toHaveLength(13);
  });
});
```

(The duplicate `vi.mock` declarations in one file are not allowed — split the reservations fixture into a separate test file `work-orders-service-pagination-reservations.test.ts` if the above generates a "duplicate mock" error. Same structure, matching imports.)

- [ ] **Step 5.2: Run — expect FAIL**

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/`

Expected: FAILs — `listReservationsForCommunity` does not exist yet.

- [ ] **Step 5.3: Add the admin-scoped service function**

Append to `apps/web/src/lib/services/work-orders-service.ts`:

```ts
export interface PaginatedReservations {
  data: AmenityReservationRecord[];
  total: number;
}

export async function listReservationsForCommunity(
  communityId: number,
  filters?: {
    page?: number;
    limit?: number;
    status?: AmenityReservationStatus;
    unitId?: number;
    allowedUnitIds?: number[];
  },
): Promise<PaginatedReservations> {
  const scoped = createScopedClient(communityId);
  const page = Math.max(1, filters?.page ?? 1);
  const limit = Math.min(Math.max(1, filters?.limit ?? 20), 100);
  const offset = (page - 1) * limit;

  const whereFilters: unknown[] = [];
  if (filters?.status) whereFilters.push(eq(amenityReservations.status, filters.status));
  if (filters?.unitId !== undefined) whereFilters.push(eq(amenityReservations.unitId, filters.unitId));
  if (filters?.allowedUnitIds) {
    if (filters.allowedUnitIds.length === 0) return { data: [], total: 0 };
    whereFilters.push(inArray(amenityReservations.unitId, filters.allowedUnitIds));
  }

  const where = whereFilters.length > 0 ? and(...(whereFilters as [never, ...never[]])) : undefined;

  const rows = await scoped
    .selectFrom<AmenityReservationRecord>(amenityReservations, {}, where as never)
    .orderBy(desc(amenityReservations.startTime))
    .limit(limit)
    .offset(offset);

  const total = await scoped.countFrom(amenityReservations, where as never);

  return { data: rows.map(mapReservationRow), total };
}
```

- [ ] **Step 5.4: Update the `GET /api/v1/reservations` route**

Replace `apps/web/src/app/api/v1/reservations/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromQuery } from '@/lib/finance/request';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  getActorUnitIds,
  isResidentRole,
  requireAmenitiesEnabled,
  requireAmenitiesReadPermission,
} from '@/lib/work-orders/common';
import {
  listReservationsForActor,
  listReservationsForCommunity,
} from '@/lib/services/work-orders-service';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  requireAmenitiesEnabled(membership);
  await requirePlanFeature(communityId, 'hasAmenities');
  requireAmenitiesReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawPage = searchParams.get('page');
  const rawLimit = searchParams.get('limit');
  const page = rawPage ? Math.max(1, parsePositiveInt(rawPage, 'page')) : 1;
  const limit = rawLimit ? Math.min(Math.max(1, parsePositiveInt(rawLimit, 'limit')), 100) : 20;

  if (isResidentRole(membership.role)) {
    // Residents: scope to their own unit(s). Reuse existing actor helper,
    // client-side slice for page/limit to preserve the list contract.
    const all = await listReservationsForActor(communityId, actorUserId);
    const total = all.length;
    const offset = (page - 1) * limit;
    return NextResponse.json({
      data: all.slice(offset, offset + limit),
      meta: { page, limit, total },
    });
  }

  const scoped = createScopedClient(communityId);
  const allowedUnitIds = isResidentRole(membership.role)
    ? await getActorUnitIds(scoped, actorUserId)
    : undefined;

  const { data, total } = await listReservationsForCommunity(communityId, {
    page,
    limit,
    allowedUnitIds,
  });

  return NextResponse.json({ data, meta: { page, limit, total } });
});
```

- [ ] **Step 5.5: Run tests + typecheck**

Run: `pnpm typecheck`

Run: `pnpm exec vitest run apps/web/__tests__/lib/services/ apps/web/__tests__/reservations/`

Expected: PASS.

- [ ] **Step 5.6: Commit**

```bash
git add apps/web/src/lib/services/work-orders-service.ts \
        apps/web/src/app/api/v1/reservations/route.ts \
        apps/web/__tests__/lib/services/
git commit -m "feat(operations): reservations API page-based pagination + admin scope"
```

---

## Task 6 — Client hooks: paginated shapes, mutation hooks, `useVendors`

**Files:**
- Modify: `apps/web/src/hooks/use-operations.ts`
- Create: `apps/web/src/hooks/__tests__/use-operations-mutations.test.ts`
- Create: `apps/web/src/hooks/__tests__/use-vendors.test.ts`

This task updates `WorkOrderListResponse` + `ReservationListResponse` to the paginated `{ data, meta }` shape, adds three mutation hooks (`useCreateMaintenanceRequest`, `useCreateWorkOrder`, `useCreateReservation`), extends `useOperations` + `useReservations` + `useWorkOrders` for the new response shape, and adds `useVendors` for the vendor picker.

- [ ] **Step 6.1: Write failing mutation-hooks test**

Create `apps/web/src/hooks/__tests__/use-operations-mutations.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  useCreateMaintenanceRequest,
  useCreateWorkOrder,
  useCreateReservation,
} from '../use-operations';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useCreateMaintenanceRequest', () => {
  it('POSTs to /api/v1/maintenance-requests and invalidates list', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 1 } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateMaintenanceRequest(42), { wrapper: wrapper(qc) });

    result.current.mutate({ title: 'Leak', description: 'sink', category: 'plumbing', priority: 'normal' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/maintenance-requests');
    expect(call[1].method).toBe('POST');
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
  });
});

describe('useCreateWorkOrder', () => {
  it('POSTs to /api/v1/work-orders with the given fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 1 } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreateWorkOrder(42), { wrapper: wrapper(qc) });

    result.current.mutate({
      title: 'Repair pump',
      description: 'Broken',
      priority: 'high',
      unitId: 7,
      vendorId: 3,
      slaResponseHours: 4,
      slaCompletionHours: 24,
      notes: null,
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/work-orders');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ communityId: 42, title: 'Repair pump', vendorId: 3 });
  });
});

describe('useCreateReservation', () => {
  it('POSTs to /api/v1/amenities/[id]/reserve', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: 1 } }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useCreateReservation(42), { wrapper: wrapper(qc) });

    result.current.mutate({
      amenityId: 9,
      unitId: 5,
      startTime: '2026-05-01T14:00:00-04:00',
      endTime: '2026-05-01T15:00:00-04:00',
      notes: null,
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/amenities/9/reserve');
  });
});
```

- [ ] **Step 6.2: Write failing `useVendors` test**

Create `apps/web/src/hooks/__tests__/use-vendors.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import { useVendors } from '../use-operations';

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => fetchMock.mockReset());

describe('useVendors', () => {
  it('fetches /api/v1/vendors?communityId=X and returns data array', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: [{ id: 1, name: 'Acme Plumbing', isActive: true }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useVendors(42), { wrapper: wrapper(qc) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: 1, name: 'Acme Plumbing', isActive: true }]);
    expect(fetchMock.mock.calls[0]![0]).toContain('/api/v1/vendors?communityId=42');
  });

  it('is disabled when communityId is 0', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useVendors(0), { wrapper: wrapper(qc) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6.3: Run both — expect FAIL**

Run: `pnpm exec vitest run apps/web/src/hooks/__tests__/use-operations-mutations.test.ts apps/web/src/hooks/__tests__/use-vendors.test.ts`

Expected: FAILs — none of `useCreateMaintenanceRequest`, `useCreateWorkOrder`, `useCreateReservation`, `useVendors` exist.

- [ ] **Step 6.4: Extend `use-operations.ts` — paginated shapes**

In `apps/web/src/hooks/use-operations.ts`, update the response types (around lines 55-83):

```ts
// Extend OperationsListItem union:
export interface OperationsListItem {
  id: number;
  type: 'maintenance_request' | 'work_order' | 'reservation';
  title: string;
  status: string;
  priority: string;
  unitId: number | null;
  createdAt: string;
}

// Paginated wrappers:
export interface WorkOrderListResponse {
  data: WorkOrderListItem[];
  meta: { page: number; limit: number; total: number };
}

export interface ReservationListResponse {
  data: ReservationListItem[];
  meta: { page: number; limit: number; total: number };
}

// Vendor shape used by the picker:
export interface VendorListItem {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  specialties: string[] | null;
  isActive: boolean;
}
```

Update `useWorkOrders` (around line 178) — accept `page`/`limit`, query key includes them, response type is `WorkOrderListResponse`:

```ts
export const WORK_ORDER_KEYS = {
  all: ['work-orders'] as const,
  list: (
    communityId: number,
    params?: { status?: string; unitId?: number; page?: number; limit?: number },
  ) => [
    'work-orders', 'list', communityId,
    params?.status ?? 'all',
    params?.unitId ?? 'all',
    params?.page ?? 1,
    params?.limit ?? 20,
  ] as const,
  detail: (communityId: number, workOrderId: number) =>
    ['work-orders', 'detail', communityId, workOrderId] as const,
} as const;

export function useWorkOrders(
  communityId: number,
  params?: { status?: WorkOrderListItem['status']; unitId?: number; page?: number; limit?: number },
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;

  return useQuery({
    queryKey: WORK_ORDER_KEYS.list(communityId, { ...params, page, limit }),
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        communityId: String(communityId),
        page: String(page),
        limit: String(limit),
      });
      if (params?.status) searchParams.set('status', params.status);
      if (params?.unitId) searchParams.set('unitId', String(params.unitId));
      return requestJson<WorkOrderListResponse>(`/api/v1/work-orders?${searchParams.toString()}`);
    },
    enabled: enabled && communityId > 0,
    staleTime: 60_000,
  });
}
```

Update `useReservations` similarly:

```ts
export const RESERVATION_KEYS = {
  all: ['reservations'] as const,
  list: (communityId: number, params?: { page?: number; limit?: number }) =>
    ['reservations', 'list', communityId, params?.page ?? 1, params?.limit ?? 20] as const,
  detail: (communityId: number, reservationId: number) =>
    ['reservations', 'detail', communityId, reservationId] as const,
} as const;

export function useReservations(
  communityId: number,
  params?: { page?: number; limit?: number },
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;

  return useQuery({
    queryKey: RESERVATION_KEYS.list(communityId, { page, limit }),
    queryFn: async () => {
      const sp = new URLSearchParams({
        communityId: String(communityId),
        page: String(page),
        limit: String(limit),
      });
      return requestJson<ReservationListResponse>(`/api/v1/reservations?${sp.toString()}`);
    },
    enabled: enabled && communityId > 0,
    staleTime: 60_000,
  });
}
```

- [ ] **Step 6.5: Append mutation hooks and `useVendors`**

At the bottom of `apps/web/src/hooks/use-operations.ts`:

```ts
export interface CreateMaintenanceRequestInput {
  title: string;
  description: string;
  category: 'plumbing' | 'electrical' | 'hvac' | 'general' | 'other';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  storagePaths?: string[];
}

export function useCreateMaintenanceRequest(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMaintenanceRequestInput) =>
      requestJson<{ data: MaintenanceRequestItem }>('/api/v1/maintenance-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['maintenance-requests', 'list'] });
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}

export interface CreateWorkOrderInput {
  title: string;
  description: string | null;
  unitId: number | null;
  vendorId: number | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  slaResponseHours: number | null;
  slaCompletionHours: number | null;
  notes: string | null;
}

export function useCreateWorkOrder(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWorkOrderInput) =>
      requestJson<{ data: WorkOrderListItem }>('/api/v1/work-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORK_ORDER_KEYS.all });
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}

export interface CreateReservationInput {
  amenityId: number;
  unitId: number | null;
  startTime: string;
  endTime: string;
  notes: string | null;
}

export function useCreateReservation(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReservationInput) =>
      requestJson<{ data: ReservationListItem }>(
        `/api/v1/amenities/${input.amenityId}/reserve`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            communityId,
            unitId: input.unitId,
            startTime: input.startTime,
            endTime: input.endTime,
            notes: input.notes,
          }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RESERVATION_KEYS.all });
      await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
    },
  });
}

export const VENDOR_KEYS = {
  all: ['vendors'] as const,
  list: (communityId: number) => ['vendors', 'list', communityId] as const,
} as const;

export function useVendors(communityId: number) {
  return useQuery({
    queryKey: VENDOR_KEYS.list(communityId),
    queryFn: async () => {
      const res = await requestJson<{ data: VendorListItem[] }>(
        `/api/v1/vendors?communityId=${communityId}`,
      );
      return res.data;
    },
    enabled: communityId > 0,
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 6.6: Run tests + typecheck**

Run: `pnpm typecheck`

Run: `pnpm exec vitest run apps/web/src/hooks/__tests__/`

Expected: PASS. Any callers of the old `useWorkOrders` array shape will surface as typecheck errors — those are intentional and get fixed in Task 11 (operations-hub rewrite).

- [ ] **Step 6.7: Commit**

```bash
git add apps/web/src/hooks/use-operations.ts apps/web/src/hooks/__tests__/
git commit -m "feat(operations): client hooks for paginated lists, mutations, vendors"
```

---

## Task 7 — Shared `<FormDrawer>` container

**Files:**
- Create: `apps/web/src/components/operations/FormDrawer.tsx`
- Create: `apps/web/src/components/operations/__tests__/FormDrawer.test.tsx`

Consistent Sheet container for all three create drawers. Right-side sheet, fixed width, standard header/description, sticky footer.

- [ ] **Step 7.1: Write failing test**

Create `apps/web/src/components/operations/__tests__/FormDrawer.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormDrawer } from '../FormDrawer';

describe('<FormDrawer>', () => {
  it('renders title, description, children, and a close button when open', () => {
    render(
      <FormDrawer open={true} onOpenChange={vi.fn()} title="Test Drawer" description="Subtitle here">
        <p>body content</p>
      </FormDrawer>,
    );
    expect(screen.getByRole('heading', { name: 'Test Drawer' })).toBeInTheDocument();
    expect(screen.getByText('Subtitle here')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) when the close button is clicked', () => {
    const onChange = vi.fn();
    render(
      <FormDrawer open={true} onOpenChange={onChange} title="T">
        <p>x</p>
      </FormDrawer>,
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing when open={false}', () => {
    render(
      <FormDrawer open={false} onOpenChange={vi.fn()} title="Hidden">
        <p>x</p>
      </FormDrawer>,
    );
    expect(screen.queryByRole('heading', { name: 'Hidden' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2: Run — expect FAIL**

Run: `pnpm exec vitest run apps/web/src/components/operations/__tests__/FormDrawer.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement `FormDrawer`**

Create `apps/web/src/components/operations/FormDrawer.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface FormDrawerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function FormDrawer({ open, onOpenChange, title, description, children }: FormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="mt-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 7.4: Run — expect PASS**

Run: `pnpm exec vitest run apps/web/src/components/operations/__tests__/FormDrawer.test.tsx`

Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add apps/web/src/components/operations/FormDrawer.tsx \
        apps/web/src/components/operations/__tests__/FormDrawer.test.tsx
git commit -m "feat(operations): shared FormDrawer container for create sheets"
```

---

## Task 8 — `<RequestCreateSheet>` — wrap existing SubmitForm

**Files:**
- Create: `apps/web/src/components/operations/RequestCreateSheet.tsx`
- Create: `apps/web/src/components/operations/__tests__/RequestCreateSheet.test.tsx`

- [ ] **Step 8.1: Write failing test**

Create `apps/web/src/components/operations/__tests__/RequestCreateSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/components/maintenance/SubmitForm', () => ({
  SubmitForm: (props: { onCreated?: (r: { id: number }) => void }) => (
    <button
      type="button"
      onClick={() => props.onCreated?.({ id: 99 })}
      data-testid="submit-form-stub"
    >
      mock submit form
    </button>
  ),
}));

import { RequestCreateSheet } from '../RequestCreateSheet';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      {ui}
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe('<RequestCreateSheet>', () => {
  it('renders the Submit Request drawer when open', () => {
    render(wrap(
      <RequestCreateSheet open={true} onOpenChange={vi.fn()} communityId={42} userId="u-1" />,
    ));
    expect(screen.getByRole('heading', { name: /submit request/i })).toBeInTheDocument();
    expect(screen.getByTestId('submit-form-stub')).toBeInTheDocument();
  });

  it('calls onOpenChange(false) after SubmitForm.onCreated fires', async () => {
    const onOpenChange = vi.fn();
    render(wrap(
      <RequestCreateSheet open={true} onOpenChange={onOpenChange} communityId={42} userId="u-1" />,
    ));
    fireEvent.click(screen.getByTestId('submit-form-stub'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
```

- [ ] **Step 8.2: Run — expect FAIL**

Run: `pnpm exec vitest run apps/web/src/components/operations/__tests__/RequestCreateSheet.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 8.3: Implement `RequestCreateSheet`**

Create `apps/web/src/components/operations/RequestCreateSheet.tsx`:

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { SubmitForm } from '@/components/maintenance/SubmitForm';
import { MAINTENANCE_REQUEST_KEYS, OPERATIONS_KEYS } from '@/hooks/use-operations';
import { FormDrawer } from './FormDrawer';

interface RequestCreateSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  communityId: number;
  userId: string;
}

export function RequestCreateSheet({ open, onOpenChange, communityId, userId }: RequestCreateSheetProps) {
  const queryClient = useQueryClient();

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Submit Request"
      description="Open a maintenance request for this community."
    >
      <SubmitForm
        communityId={communityId}
        userId={userId}
        onCreated={async () => {
          await queryClient.invalidateQueries({ queryKey: ['maintenance-requests', 'list'] });
          await queryClient.invalidateQueries({ queryKey: OPERATIONS_KEYS.listRoot(communityId) });
          onOpenChange(false);
        }}
      />
    </FormDrawer>
  );
}
```

Note: `MAINTENANCE_REQUEST_KEYS.list(...)` takes a communityId + scope + params tuple; invalidating the common `['maintenance-requests', 'list']` root prefix is the correct breadth here (TanStack Query invalidates by prefix match).

- [ ] **Step 8.4: Run — expect PASS**

Run: `pnpm exec vitest run apps/web/src/components/operations/__tests__/RequestCreateSheet.test.tsx`

Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add apps/web/src/components/operations/RequestCreateSheet.tsx \
        apps/web/src/components/operations/__tests__/RequestCreateSheet.test.tsx
git commit -m "feat(operations): RequestCreateSheet wraps SubmitForm in drawer"
```

---

## Task 9 — `<WorkOrderCreateSheet>` — admin-only, vendor picker

**Files:**
- Create: `apps/web/src/components/operations/WorkOrderCreateSheet.tsx`
- Create: `apps/web/src/components/operations/__tests__/WorkOrderCreateSheet.test.tsx`

Fields per POST schema at [apps/web/src/app/api/v1/work-orders/route.ts:22-33](../../../apps/web/src/app/api/v1/work-orders/route.ts:22):
- `title` (required, 1-240)
- `description` (optional, ≤5000)
- `priority` (required, defaults `medium`)
- `unitId` (optional)
- `vendorId` (optional) — rendered as a `<select>` populated from `useVendors`
- `slaResponseHours` (optional, positive int)
- `slaCompletionHours` (optional, positive int)
- `notes` (optional, ≤5000)

- [ ] **Step 9.1: Write failing test**

Create `apps/web/src/components/operations/__tests__/WorkOrderCreateSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { useVendorsMock, useCreateWorkOrderMock } = vi.hoisted(() => ({
  useVendorsMock: vi.fn(),
  useCreateWorkOrderMock: vi.fn(),
}));

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return { ...actual, useVendors: useVendorsMock, useCreateWorkOrder: useCreateWorkOrderMock };
});

import { WorkOrderCreateSheet } from '../WorkOrderCreateSheet';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const mutateAsync = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useVendorsMock.mockReturnValue({
    data: [{ id: 1, name: 'Acme', company: null, phone: null, email: null, specialties: null, isActive: true }],
    isLoading: false,
  });
  useCreateWorkOrderMock.mockReturnValue({ mutateAsync, isPending: false });
  mutateAsync.mockResolvedValue({ data: { id: 1 } });
});

describe('<WorkOrderCreateSheet>', () => {
  it('renders the Dispatch Work Order drawer with vendor picker options', () => {
    render(wrap(
      <WorkOrderCreateSheet open={true} onOpenChange={vi.fn()} communityId={42} />,
    ));
    expect(screen.getByRole('heading', { name: /dispatch work order/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/vendor/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /acme/i })).toBeInTheDocument();
  });

  it('submits a minimal payload with vendor', async () => {
    const onOpenChange = vi.fn();
    render(wrap(
      <WorkOrderCreateSheet open={true} onOpenChange={onOpenChange} communityId={42} />,
    ));

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Fix pump' } });
    fireEvent.change(screen.getByLabelText(/vendor/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /dispatch/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Fix pump',
      vendorId: 1,
      priority: 'medium',
    }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('allows "assign later" when vendor is left empty', async () => {
    render(wrap(<WorkOrderCreateSheet open={true} onOpenChange={vi.fn()} communityId={42} />));
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Fix' } });
    fireEvent.click(screen.getByRole('button', { name: /dispatch/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0]![0]).toMatchObject({ vendorId: null });
  });
});
```

- [ ] **Step 9.2: Run — expect FAIL**

Run: `pnpm exec vitest run apps/web/src/components/operations/__tests__/WorkOrderCreateSheet.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 9.3: Implement `WorkOrderCreateSheet`**

Create `apps/web/src/components/operations/WorkOrderCreateSheet.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useCreateWorkOrder, useVendors } from '@/hooks/use-operations';
import { FormDrawer } from './FormDrawer';

interface WorkOrderCreateSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  communityId: number;
}

const PRIORITIES: ReadonlyArray<'low' | 'medium' | 'high' | 'urgent'> = ['low', 'medium', 'high', 'urgent'];

export function WorkOrderCreateSheet({ open, onOpenChange, communityId }: WorkOrderCreateSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [unitId, setUnitId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [slaResponseHours, setSlaResponseHours] = useState('');
  const [slaCompletionHours, setSlaCompletionHours] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const vendorsQuery = useVendors(communityId);
  const createMutation = useCreateWorkOrder(communityId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        unitId: unitId ? Number(unitId) : null,
        vendorId: vendorId ? Number(vendorId) : null,
        slaResponseHours: slaResponseHours ? Number(slaResponseHours) : null,
        slaCompletionHours: slaCompletionHours ? Number(slaCompletionHours) : null,
        notes: notes.trim() || null,
      });
      // Reset and close.
      setTitle(''); setDescription(''); setPriority('medium'); setUnitId('');
      setVendorId(''); setSlaResponseHours(''); setSlaCompletionHours(''); setNotes('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create work order');
    }
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Dispatch Work Order"
      description="Assign maintenance work to a vendor."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="wo-title" className="block text-sm font-medium text-content-secondary">Title</label>
          <input
            id="wo-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={240}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="wo-description" className="block text-sm font-medium text-content-secondary">Description</label>
          <textarea
            id="wo-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={3}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="wo-priority" className="block text-sm font-medium text-content-secondary">Priority</label>
            <select
              id="wo-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="wo-vendor" className="block text-sm font-medium text-content-secondary">Vendor</label>
            <select
              id="wo-vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            >
              <option value="">(Assign later)</option>
              {vendorsQuery.data?.filter((v) => v.isActive).map((v) => (
                <option key={v.id} value={String(v.id)}>{v.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="wo-unit" className="block text-sm font-medium text-content-secondary">Unit ID</label>
            <input
              id="wo-unit"
              type="number"
              min={1}
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="wo-sla-response" className="block text-sm font-medium text-content-secondary">SLA Response (hrs)</label>
            <input
              id="wo-sla-response"
              type="number"
              min={1}
              value={slaResponseHours}
              onChange={(e) => setSlaResponseHours(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="wo-sla-completion" className="block text-sm font-medium text-content-secondary">SLA Completion (hrs)</label>
          <input
            id="wo-sla-completion"
            type="number"
            min={1}
            value={slaCompletionHours}
            onChange={(e) => setSlaCompletionHours(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="wo-notes" className="block text-sm font-medium text-content-secondary">Notes</label>
          <textarea
            id="wo-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        {error ? (
          <p className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {createMutation.isPending ? 'Dispatching…' : 'Dispatch Work Order'}
        </button>
      </form>
    </FormDrawer>
  );
}
```

- [ ] **Step 9.4: Run — expect PASS**

Run: `pnpm exec vitest run apps/web/src/components/operations/__tests__/WorkOrderCreateSheet.test.tsx`

Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add apps/web/src/components/operations/WorkOrderCreateSheet.tsx \
        apps/web/src/components/operations/__tests__/WorkOrderCreateSheet.test.tsx
git commit -m "feat(operations): WorkOrderCreateSheet with vendor picker"
```

---

## Task 10 — `<ReservationCreateSheet>` — amenity picker + date/time

**Files:**
- Create: `apps/web/src/components/operations/ReservationCreateSheet.tsx`
- Create: `apps/web/src/components/operations/__tests__/ReservationCreateSheet.test.tsx`

Fields per POST schema at [apps/web/src/app/api/v1/amenities/[id]/reserve/route.ts:23-29](../../../apps/web/src/app/api/v1/amenities/[id]/reserve/route.ts:23):
- `amenityId` (from a `useAmenities` list; new helper in this task)
- `unitId` (optional)
- `startTime` / `endTime` (ISO datetime with offset)
- `notes` (optional)

The drawer constructs ISO datetimes from date + time + community timezone (Luxon or `formatInCommunityTimezone` inverse). Since `formatInCommunityTimezone` is for display only, use `date-fns-tz`'s `zonedTimeToUtc` — but confirm during implementation that it's already in the dependency graph. If not, assemble the ISO string via `new Date('YYYY-MM-DDTHH:MM:00').toISOString()` with the timezone offset appended. Simpler: the drawer's date/time inputs produce local ISO strings; the reservation API accepts `.datetime({ offset: true })`, so we require the user's browser to be on community time (acceptable Phase 2 limitation — noted in follow-ups).

- [ ] **Step 10.1: Write failing test**

Create `apps/web/src/components/operations/__tests__/ReservationCreateSheet.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { useAmenitiesMock, useCreateReservationMock } = vi.hoisted(() => ({
  useAmenitiesMock: vi.fn(),
  useCreateReservationMock: vi.fn(),
}));

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return { ...actual, useAmenities: useAmenitiesMock, useCreateReservation: useCreateReservationMock };
});

import { ReservationCreateSheet } from '../ReservationCreateSheet';

const mutateAsync = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useAmenitiesMock.mockReturnValue({
    data: [{ id: 9, name: 'Pool', description: null, location: null }],
    isLoading: false,
  });
  useCreateReservationMock.mockReturnValue({ mutateAsync, isPending: false });
  mutateAsync.mockResolvedValue({ data: { id: 1 } });
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe('<ReservationCreateSheet>', () => {
  it('shows the Reserve Amenity drawer with amenity options', () => {
    render(wrap(
      <ReservationCreateSheet open={true} onOpenChange={vi.fn()} communityId={42} communityTimezone="America/New_York" />,
    ));
    expect(screen.getByRole('heading', { name: /reserve amenity/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /pool/i })).toBeInTheDocument();
  });

  it('submits a reservation with amenityId, date, startTime, endTime', async () => {
    const onOpenChange = vi.fn();
    render(wrap(
      <ReservationCreateSheet open={true} onOpenChange={onOpenChange} communityId={42} communityTimezone="America/New_York" />,
    ));

    fireEvent.change(screen.getByLabelText(/amenity/i), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '14:00' } });
    fireEvent.change(screen.getByLabelText(/end time/i), { target: { value: '15:00' } });
    fireEvent.click(screen.getByRole('button', { name: /reserve/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const payload = mutateAsync.mock.calls[0]![0];
    expect(payload.amenityId).toBe(9);
    expect(payload.startTime).toMatch(/^2026-05-01T14:00:00/);
    expect(payload.endTime).toMatch(/^2026-05-01T15:00:00/);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
```

- [ ] **Step 10.2: Add the `useAmenities` list hook**

Append to `apps/web/src/hooks/use-operations.ts` (near the other query hooks):

```ts
export interface AmenityListItem {
  id: number;
  name: string;
  description: string | null;
  location: string | null;
}

export const AMENITY_KEYS = {
  all: ['amenities'] as const,
  list: (communityId: number) => ['amenities', 'list', communityId] as const,
} as const;

export function useAmenities(communityId: number) {
  return useQuery({
    queryKey: AMENITY_KEYS.list(communityId),
    queryFn: async () => {
      const res = await requestJson<{ data: AmenityListItem[] }>(
        `/api/v1/amenities?communityId=${communityId}`,
      );
      return res.data;
    },
    enabled: communityId > 0,
    staleTime: 5 * 60_000,
  });
}
```

- [ ] **Step 10.3: Run — expect FAIL**

Run: `pnpm exec vitest run apps/web/src/components/operations/__tests__/ReservationCreateSheet.test.tsx`

Expected: FAIL — module not found.

- [ ] **Step 10.4: Implement `ReservationCreateSheet`**

Create `apps/web/src/components/operations/ReservationCreateSheet.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useAmenities, useCreateReservation } from '@/hooks/use-operations';
import { FormDrawer } from './FormDrawer';

interface ReservationCreateSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  communityId: number;
  communityTimezone: string;
}

/**
 * Returns an ISO-8601 datetime string with offset, interpreting the input
 * date+time as being in the given IANA timezone. Uses Intl to resolve the
 * offset at the target instant (handles DST correctly).
 */
function toZonedIsoString(date: string, time: string, timezone: string): string {
  // "2026-05-01" + "14:00" → "2026-05-01T14:00:00" (local to timezone)
  const naive = `${date}T${time}:00`;
  const naiveDate = new Date(naive);

  // Compute the zone's UTC offset at the naive instant.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  });
  const parts = dtf.formatToParts(naiveDate);
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00';
  // "GMT-04" → "-04:00"; "GMT+5:30" → "+05:30"; "GMT" → "+00:00".
  const match = offsetPart.match(/GMT(?:([+-])(\d{1,2})(?::?(\d{2}))?)?/);
  if (!match) return `${naive}+00:00`;
  const sign = match[1] ?? '+';
  const hh = match[2] ? match[2].padStart(2, '0') : '00';
  const mm = match[3] ?? '00';
  return `${naive}${sign}${hh}:${mm}`;
}

export function ReservationCreateSheet({
  open,
  onOpenChange,
  communityId,
  communityTimezone,
}: ReservationCreateSheetProps) {
  const [amenityId, setAmenityId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [unitId, setUnitId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const amenitiesQuery = useAmenities(communityId);
  const createMutation = useCreateReservation(communityId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!amenityId || !date || !startTime || !endTime) {
      setError('Amenity, date, start time, and end time are required.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        amenityId: Number(amenityId),
        unitId: unitId ? Number(unitId) : null,
        startTime: toZonedIsoString(date, startTime, communityTimezone),
        endTime: toZonedIsoString(date, endTime, communityTimezone),
        notes: notes.trim() || null,
      });
      setAmenityId(''); setDate(''); setStartTime(''); setEndTime('');
      setUnitId(''); setNotes('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create reservation');
    }
  }

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Reserve Amenity"
      description="Book a community amenity for a time slot."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="res-amenity" className="block text-sm font-medium text-content-secondary">Amenity</label>
          <select
            id="res-amenity"
            value={amenityId}
            onChange={(e) => setAmenityId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          >
            <option value="">(Select an amenity)</option>
            {amenitiesQuery.data?.map((a) => (
              <option key={a.id} value={String(a.id)}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="res-date" className="block text-sm font-medium text-content-secondary">Date</label>
          <input
            id="res-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="res-start" className="block text-sm font-medium text-content-secondary">Start time</label>
            <input
              id="res-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="res-end" className="block text-sm font-medium text-content-secondary">End time</label>
            <input
              id="res-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label htmlFor="res-unit" className="block text-sm font-medium text-content-secondary">Unit ID (optional)</label>
          <input
            id="res-unit"
            type="number"
            min={1}
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="res-notes" className="block text-sm font-medium text-content-secondary">Notes</label>
          <textarea
            id="res-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          />
        </div>
        {error ? (
          <p className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {createMutation.isPending ? 'Reserving…' : 'Reserve'}
        </button>
      </form>
    </FormDrawer>
  );
}
```

- [ ] **Step 10.5: Run — expect PASS**

Run: `pnpm exec vitest run apps/web/src/components/operations/__tests__/ReservationCreateSheet.test.tsx`

Expected: PASS.

- [ ] **Step 10.6: Commit**

```bash
git add apps/web/src/components/operations/ReservationCreateSheet.tsx \
        apps/web/src/components/operations/__tests__/ReservationCreateSheet.test.tsx \
        apps/web/src/hooks/use-operations.ts
git commit -m "feat(operations): ReservationCreateSheet with amenity picker"
```

---

## Task 11 — Operations hub: contextual CTA + mounted sheets + `?create=` contract

**Files:**
- Modify: `apps/web/src/components/operations/operations-hub.tsx`
- Modify: `apps/web/__tests__/components/operations/operations-hub.test.tsx`
- Modify: `apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx`

This is the biggest task. Keep steps tight.

- [ ] **Step 11.1: Rewrite the three bug-pinning tests first (TDD-style)**

In `apps/web/__tests__/components/operations/operations-hub.test.tsx`:

(a) The `beforeEach` block at lines 45-87 no longer passes `requestActionHref`/`requestActionLabel`. Replace the first `render` at lines 90-101 with:

```tsx
render(
  <OperationsHub
    communityId={42}
    requestsEnabled={true}
    workOrdersEnabled={false}
    reservationsEnabled={true}
    requestScope="mine"
    isAdmin={false}
    userId="u-1"
    communityTimezone="America/New_York"
  />,
);
```

And its assertion at lines 122-125 becomes (Reservations tab → "Reserve Amenity" CTA):

```tsx
expect(screen.getByRole('button', { name: 'Reserve Amenity' })).toBeInTheDocument();
// The legacy Submit Request link must NOT appear on the reservations tab.
expect(screen.queryByRole('link', { name: 'Submit Request' })).not.toBeInTheDocument();
expect(screen.getByText('Reservation #17')).toBeInTheDocument();
```

(b) The "staff" test (lines 129-185) drops `requestActionHref="/maintenance/inbox?..."` and `requestActionLabel="Open Inbox"`. Props become:

```tsx
render(
  <OperationsHub
    communityId={42}
    requestsEnabled={true}
    workOrdersEnabled={true}
    reservationsEnabled={false}
    requestScope="community"
    isAdmin={true}
    userId="u-1"
    communityTimezone="America/New_York"
  />,
);
```

Assertion: on the Requests tab, staff see `"Submit Request"` (still — admins can submit on behalf). The "Open Inbox" link is gone.

```tsx
expect(screen.getByRole('button', { name: 'Submit Request' })).toBeInTheDocument();
```

(c) The "hides All for residents" test (lines 187-213) drops the now-removed props. Add explicit `isAdmin={false}`, `userId="u-1"`, rest unchanged.

(d) Add four new tests at the bottom of the describe block (before the closing `});`):

```tsx
it('Reservations tab shows Reserve Amenity for residents AND admins', () => {
  searchParamsMock.mockReturnValue('tab=reservations');
  render(
    <OperationsHub
      communityId={42}
      requestsEnabled={true}
      workOrdersEnabled={false}
      reservationsEnabled={true}
      requestScope="mine"
      isAdmin={false}
      userId="u-1"
      communityTimezone="America/New_York"
    />,
  );
  expect(screen.getByRole('button', { name: 'Reserve Amenity' })).toBeInTheDocument();
});

it('Work Orders tab shows Dispatch Work Order for admins, hides CTA for residents', () => {
  searchParamsMock.mockReturnValue('tab=work-orders');
  const { rerender } = render(
    <OperationsHub
      communityId={42}
      requestsEnabled={true}
      workOrdersEnabled={true}
      reservationsEnabled={false}
      requestScope="community"
      isAdmin={true}
      userId="u-1"
      communityTimezone="America/New_York"
    />,
  );
  expect(screen.getByRole('button', { name: 'Dispatch Work Order' })).toBeInTheDocument();

  rerender(
    <OperationsHub
      communityId={42}
      requestsEnabled={true}
      workOrdersEnabled={true}
      reservationsEnabled={false}
      requestScope="mine"
      isAdmin={false}
      userId="u-1"
      communityTimezone="America/New_York"
    />,
  );
  expect(screen.queryByRole('button', { name: /dispatch work order/i })).not.toBeInTheDocument();
});

it('opens a drawer when ?create=request is set in the URL', () => {
  searchParamsMock.mockReturnValue('tab=requests&create=request');
  render(
    <OperationsHub
      communityId={42}
      requestsEnabled={true}
      workOrdersEnabled={false}
      reservationsEnabled={false}
      requestScope="mine"
      isAdmin={false}
      userId="u-1"
      communityTimezone="America/New_York"
    />,
  );
  expect(screen.getByRole('heading', { name: /submit request/i })).toBeInTheDocument();
});

it('pushes ?create=request when the CTA button is clicked', () => {
  searchParamsMock.mockReturnValue('tab=requests');
  render(
    <OperationsHub
      communityId={42}
      requestsEnabled={true}
      workOrdersEnabled={false}
      reservationsEnabled={false}
      requestScope="mine"
      isAdmin={false}
      userId="u-1"
      communityTimezone="America/New_York"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
  // Open uses push (not replace) so the browser Back button can close the drawer.
  expect(pushMock).toHaveBeenCalledWith(
    expect.stringContaining('create=request'),
  );
});
```

Add `fireEvent` to the imports at the top of the test file, and extend the router mock (the `vi.hoisted` block and `vi.mock('next/navigation', ...)` at the top of the file) to include `pushMock` and `backMock`:

```ts
// BEFORE
const {
  searchParamsMock,
  replaceMock,
  ...
} = vi.hoisted(() => ({
  searchParamsMock: vi.fn(),
  replaceMock: vi.fn(),
  ...
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/communities/42/operations',
  useSearchParams: () => new URLSearchParams(searchParamsMock()),
}));

// AFTER
const {
  searchParamsMock,
  replaceMock,
  pushMock,
  backMock,
  ...
} = vi.hoisted(() => ({
  searchParamsMock: vi.fn(),
  replaceMock: vi.fn(),
  pushMock: vi.fn(),
  backMock: vi.fn(),
  ...
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock, back: backMock }),
  usePathname: () => '/communities/42/operations',
  useSearchParams: () => new URLSearchParams(searchParamsMock()),
}));
```

- [ ] **Step 11.2: Run — expect FAIL**

Run: `pnpm exec vitest run apps/web/__tests__/components/operations/operations-hub.test.tsx`

Expected: FAIL — the type signature of `OperationsHub` still requires `requestActionHref`/`requestActionLabel` and does not know about `isAdmin`/`userId`.

- [ ] **Step 11.3: Update `OperationsHub` signature and CTA computation**

In `apps/web/src/components/operations/operations-hub.tsx`:

Replace the `OperationsHubProps` interface and add CTA logic. Replace the prop signature (lines 51-70):

```ts
interface OperationsHubProps {
  communityId: number;
  legacyNotice?: string | null;
  requestsEnabled: boolean;
  workOrdersEnabled: boolean;
  reservationsEnabled: boolean;
  requestScope: MaintenanceRequestScope;
  /** Whether the viewer has admin privileges (board/CAM/PM/site manager). */
  isAdmin: boolean;
  /** Current user id, required for the Request drawer (passes through to SubmitForm). */
  userId: string;
  communityTimezone: string;
  initialTab?: string;
  initialFilters?: {
    status?: string;
    priority?: string;
    unitId?: string;
    q?: string;
    cursor?: string;
    page?: string;
    create?: string;
  };
}
```

Add at the top of the file alongside existing imports:

```ts
import { RequestCreateSheet } from './RequestCreateSheet';
import { WorkOrderCreateSheet } from './WorkOrderCreateSheet';
import { ReservationCreateSheet } from './ReservationCreateSheet';

type CreateValue = 'request' | 'work-order' | 'reservation';
const CREATE_SHEETS_ENABLED = process.env.OPERATIONS_HUB_CREATE_SHEETS !== 'off';
```

Remove the lines that read `requestActionHref` / `requestActionLabel` from props and the corresponding `<Button asChild><Link href={...}>` render block in the `PageHeader actions` and in `requestsEmptyState`.

Inside the component body, after `selectedTab` is computed, add the CTA matrix and the `?create=` parsing:

```ts
const createValue = (searchParams.get('create') ?? undefined) as CreateValue | undefined;

interface CtaConfig { label: string; createValue: CreateValue; }

function getCta(tab: OperationsTab): CtaConfig | null {
  if (tab === 'reservations') {
    return reservationsEnabled ? { label: 'Reserve Amenity', createValue: 'reservation' } : null;
  }
  if (tab === 'work-orders') {
    return isAdmin && workOrdersEnabled
      ? { label: 'Dispatch Work Order', createValue: 'work-order' }
      : null;
  }
  if (tab === 'requests') {
    return requestsEnabled ? { label: 'Submit Request', createValue: 'request' } : null;
  }
  // 'all' tab: admins get Dispatch as primary; residents (shouldn't see 'all') get Submit.
  if (isAdmin && workOrdersEnabled) return { label: 'Dispatch Work Order', createValue: 'work-order' };
  if (requestsEnabled) return { label: 'Submit Request', createValue: 'request' };
  return null;
}

const cta = getCta(selectedTab);

/**
 * Spec §5.2 requires "Back button closes" — opening a drawer must add a
 * history entry so the browser back button pops it off. We push on open,
 * and the close button calls router.back() to pop the same entry. Tab
 * switches below still use router.replace (unchanged from Phase 1) so
 * they don't bloat history.
 */
function openCreate(value: CreateValue) {
  if (!CREATE_SHEETS_ENABLED) return;  // Rollback: button is a no-op; a Link below handles fallback.
  const params = new URLSearchParams(searchParams.toString());
  params.set('create', value);
  router.push(`${pathname}?${params.toString()}`);
}

function closeCreate() {
  // Pop the history entry added by openCreate() so back-button symmetry holds.
  router.back();
}
```

Replace the `PageHeader actions={...}` block (lines 246-253) with:

```tsx
<PageHeader
  title="Operations"
  description={requestsDescription}
  actions={
    cta
      ? CREATE_SHEETS_ENABLED
        ? (
          <Button size="sm" onClick={() => openCreate(cta.createValue)}>
            {cta.label}
          </Button>
        )
        : (
          // Phase 2 rollback fallback: retain a Link to the Phase 1 destination.
          <Button asChild size="sm">
            <Link href={legacyHrefFor(cta.createValue, communityId)}>{cta.label}</Link>
          </Button>
        )
      : undefined
  }
/>
```

Add the `legacyHrefFor` helper near the top of the module:

```ts
function legacyHrefFor(value: CreateValue, communityId: number): string {
  if (value === 'request') return `/maintenance/submit?communityId=${communityId}`;
  if (value === 'work-order') return `/communities/${communityId}/operations?tab=work-orders`;
  return `/communities/${communityId}/operations?tab=reservations`;
}
```

Replace the `requestsEmptyState` CTA block (lines 212-230) with:

```tsx
const requestsEmptyState = selectedTab === 'requests'
  ? (
    <EmptyState
      title="No maintenance requests yet"
      description={
        requestScope === 'community'
          ? 'Resident submissions will appear here as they come in.'
          : 'Submit a request to start tracking repairs and follow-up here.'
      }
      icon="wrench"
      action={
        cta && CREATE_SHEETS_ENABLED
          ? (
            <Button size="sm" onClick={() => openCreate(cta.createValue)}>
              {cta.label}
            </Button>
          )
          : undefined
      }
    />
  )
  : <EmptyState preset="no_operations_items" />;
```

At the bottom of the component's JSX, just before the closing `</div>`, mount the three sheets:

```tsx
<RequestCreateSheet
  open={CREATE_SHEETS_ENABLED && createValue === 'request'}
  onOpenChange={(next) => { if (!next) closeCreate(); }}
  communityId={communityId}
  userId={userId}
/>
{isAdmin && workOrdersEnabled ? (
  <WorkOrderCreateSheet
    open={CREATE_SHEETS_ENABLED && createValue === 'work-order'}
    onOpenChange={(next) => { if (!next) closeCreate(); }}
    communityId={communityId}
  />
) : null}
{reservationsEnabled ? (
  <ReservationCreateSheet
    open={CREATE_SHEETS_ENABLED && createValue === 'reservation'}
    onOpenChange={(next) => { if (!next) closeCreate(); }}
    communityId={communityId}
    communityTimezone={communityTimezone}
  />
) : null}
```

- [ ] **Step 11.4: Consume the paginated shape for WO and reservations**

Still inside `operations-hub.tsx`, update the `useWorkOrders` and `useReservations` call sites to pass `page` from filters, and update the block that renders their data (lines 384-430) to read `.data` from the new response shape. Replace:

```tsx
// BEFORE
const workOrdersQuery = useWorkOrders(communityId, { status: ..., unitId: ... }, { enabled: workOrdersEnabled });
const reservationsQuery = useReservations(communityId, { enabled: reservationsEnabled });

// AFTER
const workOrdersQuery = useWorkOrders(
  communityId,
  {
    status: parseWorkOrderStatus(filters.status),
    unitId: filters.unitId,
    page: filters.page,
    limit: 20,
  },
  { enabled: workOrdersEnabled },
);
const reservationsQuery = useReservations(
  communityId,
  { page: filters.page, limit: 20 },
  { enabled: reservationsEnabled },
);
```

Update the `activeState` branch for `work-orders` and `reservations` (lines 180-192):

```ts
case 'work-orders':
  return {
    isLoading: workOrdersQuery.isLoading,
    error: workOrdersQuery.error,
    hasData: Boolean(workOrdersQuery.data?.data.length),
  };
case 'reservations':
  return {
    isLoading: reservationsQuery.isLoading,
    error: reservationsQuery.error,
    hasData: Boolean(reservationsQuery.data?.data.length),
  };
```

Replace the Work Orders render block (lines 384-405) with:

```tsx
{!activeState.isLoading && !activeState.error && selectedTab === 'work-orders' && workOrdersQuery.data ? (
  <div className="space-y-4">
    {workOrdersQuery.data.data.map((workOrder) => (
      <article key={workOrder.id} className="rounded-xl border border-edge bg-surface-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-content">{workOrder.title}</h2>
            {workOrder.description ? (
              <p className="text-sm text-content-secondary">{workOrder.description}</p>
            ) : null}
          </div>
          <StatusBadge status={workOrder.status} />
        </div>
      </article>
    ))}
    <LoadMoreButton
      visible={
        workOrdersQuery.data
          ? workOrdersQuery.data.meta.page * workOrdersQuery.data.meta.limit < workOrdersQuery.data.meta.total
          : false
      }
      isLoading={workOrdersQuery.isFetching}
      onClick={() => {
        const nextPage = filters.page + 1;
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', String(nextPage));
        // eslint-disable-next-line no-console
        console.info('[analytics] operations_pagination_loaded', { tab: 'work-orders', mechanism: 'page' });
        router.replace(`${pathname}?${params.toString()}`);
      }}
    />
  </div>
) : null}
```

Replace the Reservations render block (lines 407-430) similarly — swap `.map(...)` to `.data.map(...)`, add a matching `LoadMoreButton`, drop the "Showing N results" footer.

- [ ] **Step 11.5: Update `operations/page.tsx` to pass new props**

In `apps/web/src/app/(authenticated)/communities/[id]/operations/page.tsx`:

```ts
// BEFORE (lines 53-56 + JSX at line 79-81)
const requestActionHref = membership.role === 'resident'
  ? `/maintenance/submit?communityId=${communityId}`
  : `/maintenance/inbox?communityId=${communityId}`;
const requestActionLabel = membership.role === 'resident' ? 'Submit Request' : 'Open Inbox';
// ... <OperationsHub ... requestActionHref={requestActionHref} requestActionLabel={requestActionLabel} ... />

// AFTER — remove both local consts and replace the JSX:
return (
  <OperationsHub
    communityId={communityId}
    legacyNotice={legacyNotice}
    requestsEnabled={requestsEnabled}
    workOrdersEnabled={workOrdersEnabled}
    reservationsEnabled={reservationsEnabled}
    requestScope={requestScope}
    isAdmin={membership.isAdmin}
    userId={userId}
    communityTimezone={communityTimezone}
    initialTab={tab}
    initialFilters={{ status, priority, unitId, q, cursor, page }}
  />
);
```

Also extend the `searchParams` interface at line 26-36 to include `create`:

```ts
searchParams: Promise<{
  from?: string;
  tab?: string;
  status?: string;
  priority?: string;
  unitId?: string;
  q?: string;
  cursor?: string;
  page?: string;
  create?: string;
}>;
```

Destructure `create` and pass it through `initialFilters` (completes the SSR contract; the client reads from `useSearchParams` at runtime).

- [ ] **Step 11.6: Run — expect PASS**

Run: `pnpm exec vitest run apps/web/__tests__/components/operations/operations-hub.test.tsx`

Expected: PASS on every case.

Run: `pnpm typecheck`

Expected: no errors.

- [ ] **Step 11.7: Run broader unit suite**

Run: `pnpm exec vitest run apps/web/__tests__/ apps/web/src/`

Expected: PASS. Any test that imported `OperationsHub` with the old prop signature is updated in Step 11.1; confirm no stragglers.

- [ ] **Step 11.8: Commit**

```bash
git add apps/web/src/components/operations/operations-hub.tsx \
        apps/web/src/app/\(authenticated\)/communities/\[id\]/operations/page.tsx \
        apps/web/__tests__/components/operations/operations-hub.test.tsx
git commit -m "feat(operations): contextual CTA + create-sheet URL contract"
```

---

## Task 12 — Rollback flag wiring: `OPERATIONS_HUB_CREATE_SHEETS=off`

**Files:**
- Modify: `apps/web/src/components/operations/operations-hub.tsx` (verify Task 11 branch)
- Create: `apps/web/__tests__/components/operations/operations-hub-rollback.test.tsx`

Task 11 already introduced `CREATE_SHEETS_ENABLED`. This task verifies the rollback path with a dedicated test and documents the flag in the repo.

- [ ] **Step 12.1: Write rollback test (will PASS immediately because flag reads env at module load)**

Create `apps/web/__tests__/components/operations/operations-hub-rollback.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

// vi.mock hoists to the TOP of the file — placed here so it applies to the
// dynamic import inside the `it` block below.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/communities/42/operations',
  useSearchParams: () => new URLSearchParams('tab=requests'),
}));

vi.mock('@/hooks/use-operations', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-operations')>('@/hooks/use-operations');
  return {
    ...actual,
    useMaintenanceRequests: () => ({ isLoading: false, error: null, data: { data: [], meta: { total: 0, page: 1, limit: 20 } } }),
    useOperations: () => ({ isLoading: false, error: null, data: { data: [], meta: { partialFailure: false, unavailableSources: [] } } }),
    useWorkOrders: () => ({ isLoading: false, error: null, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } }),
    useReservations: () => ({ isLoading: false, error: null, data: { data: [], meta: { page: 1, limit: 20, total: 0 } } }),
  };
});

describe('OperationsHub — OPERATIONS_HUB_CREATE_SHEETS=off fallback', () => {
  const originalEnv = process.env.OPERATIONS_HUB_CREATE_SHEETS;

  beforeAll(() => {
    // Set env BEFORE the first import of the hub module in this file.
    process.env.OPERATIONS_HUB_CREATE_SHEETS = 'off';
    vi.resetModules();
  });
  afterAll(() => {
    process.env.OPERATIONS_HUB_CREATE_SHEETS = originalEnv;
    vi.resetModules();
  });

  it('emits a Link with the legacy href instead of a button when flag=off', async () => {
    // Dynamic import AFTER env override so the module-level constant captures it.
    const { OperationsHub } = await import('../../../src/components/operations/operations-hub');

    render(
      <OperationsHub
        communityId={42}
        requestsEnabled={true}
        workOrdersEnabled={false}
        reservationsEnabled={false}
        requestScope="mine"
        isAdmin={false}
        userId="u-1"
        communityTimezone="America/New_York"
      />,
    );

    // Expect a Link, NOT a button, with the Phase 1 legacy href.
    const link = screen.getByRole('link', { name: 'Submit Request' });
    expect(link).toHaveAttribute('href', '/maintenance/submit?communityId=42');
  });
});
```

- [ ] **Step 12.2: Run — expect PASS (Task 11 already implemented the branch)**

Run: `pnpm exec vitest run apps/web/__tests__/components/operations/operations-hub-rollback.test.tsx`

Expected: PASS. If it fails, revisit Step 11.3 — the `CREATE_SHEETS_ENABLED ? <Button onClick> : <Button asChild><Link>` branch is wrong.

- [ ] **Step 12.3: Document the flag in the repo**

Append a row to the rollback table in `docs/superpowers/specs/2026-04-22-operations-remediation-design.md` §7.2 noting that the flag is consumed at two sites: the CTA button branch and the sheet-mount branch. (Optional — the spec already documents this. Only add if the current text is ambiguous.)

Also, add a comment at the top of `operations-hub.tsx`:

```ts
/**
 * OPERATIONS_HUB_CREATE_SHEETS env var (read at module load):
 *   - default / 'on': CTA buttons open drawer sheets via ?create= URL param.
 *   - 'off': CTAs render as Phase 1 <Link>s to legacy routes; ?create= is ignored.
 * Client bundles inline this at build time; rollback requires redeploy.
 */
```

- [ ] **Step 12.4: Commit**

```bash
git add apps/web/src/components/operations/operations-hub.tsx \
        apps/web/__tests__/components/operations/operations-hub-rollback.test.tsx
git commit -m "feat(operations): OPERATIONS_HUB_CREATE_SHEETS rollback flag"
```

---

## Task 13 — Final verification, preview click-through, and PR

- [ ] **Step 13.1: Rebase onto origin/main**

```bash
git fetch origin main
git rebase origin/main
```

Resolve conflicts if any. Re-run `pnpm test && pnpm typecheck && pnpm lint` afterwards.

- [ ] **Step 13.2: Local verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm guard:operations-routes
```

All must pass.

- [ ] **Step 13.3: Commit-log inspection**

```bash
git log --oneline origin/main..HEAD
```

Expected: 12-14 new commits on top of Phase 1 corresponding to Tasks 1-12.

```bash
git diff origin/main..HEAD --stat
```

Expected: ~20-30 files changed in the scope listed in the File Structure section.

- [ ] **Step 13.4: Preview click-through**

```
preview_start("web")
```

For each role in `['owner', 'cam', 'board_president', 'site_manager']`:

1. `preview_eval: window.location.href = '/dev/agent-login?as=<role>'`
2. Wait for dashboard to load.
3. `preview_eval: window.location.href = '/communities/<seeded-id>/operations?tab=requests'`
4. `preview_click` the "Submit Request" CTA button.
5. `preview_snapshot()` — assert URL contains `create=request` AND drawer heading "Submit Request" is visible.
6. Switch to Reservations tab. Click CTA — assert drawer heading "Reserve Amenity".
7. For CAM / board / PM / site manager with Work Orders enabled: switch to Work Orders tab. Click CTA — assert drawer heading "Dispatch Work Order". Submit a valid work order; confirm the new record appears in the list.
8. Refresh the page while `?create=request` is in the URL — confirm the drawer re-opens (deep-link).
9. Close the drawer — confirm the URL loses `create=` and tab filters survive.
10. Navigate to a community with ≥25 reservations / work orders; click "Load more"; confirm page 2 appears.

Collect the final `preview_snapshot` output for each role. Paste into the PR description under "Preview verification".

- [ ] **Step 13.5: Open the PR**

```bash
gh pr create --title "Operations hub remediation — Phase 2 (workspace, sheets, pagination, CTA)" --body "$(cat <<'EOF'
## Summary
- Three inline creation drawers via shadcn Sheet: Request (wraps existing SubmitForm), Work Order (new, admin-only, real vendor picker), Reservation (new, amenity + date/time picker with community-TZ ISO output).
- URL contract `?create=(request|work-order|reservation)` controls drawer open/close. Deep links, back button, and tab switching behave correctly. Filter params survive.
- Operations hub CTA is now contextual per tab+role+features. Fixes the "Submit Request on Reservations" bug (finding #5). Matrix:
  - Reservations tab → Reserve Amenity (any role)
  - Work Orders tab → Dispatch Work Order (admins only)
  - Requests tab → Submit Request (any role with requests enabled)
  - All tab → Dispatch Work Order primary (admins), Submit Request (residents)
- "All" feed merges reservations as a third cursor source. Phase 1 cursors remain decodable; new `reservation` type round-trips. Reservation titles render as `Reservation — <amenity name>` via amenity name attachment.
- GET /api/v1/work-orders and GET /api/v1/reservations gain `page`/`limit`/`total` pagination; hub Load More wired in on every tab. Phase 1's "Showing N results" footers are gone.
- Rollback flag `OPERATIONS_HUB_CREATE_SHEETS=off` reverts CTAs to Phase 1 `<Link>`s and ignores `?create=`. Phase 1 routing, feed-merge, and pagination remain live under rollback.

## Design reference
docs/superpowers/specs/2026-04-22-operations-remediation-design.md §5 (Phase 2 scope)
docs/superpowers/plans/2026-04-23-operations-remediation-phase-2.md (this plan)

## Test plan
- [x] `pnpm test` passes — ~15 new unit cases across service, hooks, and sheet components.
- [x] `pnpm typecheck` clean.
- [x] `pnpm lint` (incl. `guard:operations-routes`) clean.
- [x] Preview click-through verified for owner / cam / board_president / site_manager — CTA matrix behaves correctly, drawers open/close via URL, Work Order creation POSTs with vendorId, Reservation creation POSTs with ISO zoned datetimes, Load More advances page on WO and Reservations tabs.

## Rollback
Set `OPERATIONS_HUB_CREATE_SHEETS=off` in Vercel env and redeploy (~2 min). CTAs revert to Phase 1 `<Link>` forms pointing at `/maintenance/submit` etc. ?create= URL param is ignored. Reservations-in-All-feed and WO/Reservations API pagination remain live (additive, safe).

## Known follow-ups (not this PR)
- Vendor directory / vendor create UI — `<WorkOrderCreateSheet>` currently reads `GET /api/v1/vendors` but cannot create.
- Drill-down detail routes for the four entity types — none exist today; hub cards do not link. Separate.
- The other ~15 `getFeaturesForCommunity` call sites outside the operations surface.
- Server-side amenity double-booking prevention.
- CI guard `NON_OPS_ALLOWLIST` carries ~9 not-yet-implemented paths that should be removed when those pages ship.

Preview verification evidence:
<!-- paste the preview_snapshot outputs from Step 13.4 here -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 13.6: Paste preview verification evidence into the PR description**

Either via `gh pr edit <num> --body-file <file>` or via the GitHub UI.

- [ ] **Step 13.7: Return the PR URL to the user.**

---

## Self-Review — Spec coverage and plan quality

**Spec §5 coverage:**

| Spec section | Task(s) |
|---|---|
| §5.1 Contextual CTA matrix | T11 |
| §5.2 Form placement / `?create=` URL contract | T11 (URL wiring, sheet mounts) |
| §5.3 Three form components + shared container | T7 (FormDrawer), T8 (Request), T9 (WorkOrder), T10 (Reservation) |
| §5.3 Vendor picker (verified exists) | T9 (real picker, not "assign later") |
| §5.4 "All" feed merges reservations + cursor compat | T1 (union extension), T2 (merge + attachReservationTitles), T3 (API filter enum) |
| §5.5 WO/Reservations API page-based pagination | T4 (WO), T5 (Reservations), T6 (client hook shapes), T11 (hub consumes paginated) |
| §5.6 `OPERATIONS_HUB_CREATE_SHEETS=off` rollback | T11 (branch in hub), T12 (rollback test + doc) |
| §5.7 Non-scope — detail routes deferred | Explicitly documented in header + open items |
| §6.3 Hub test rewrites (lines 81-109 & others) | T11.1 |
| §6.3 Sheet component tests | T7, T8, T9, T10 |
| §6.4 Runtime click-through | T13.4 |

**Placeholder scan:** Each step contains actual code/commands/expected output. No "TBD" / "fill in later" / "add error handling" — error handling is shown explicitly in every form submit path. One TODO-ish note in T4.3 (`countFrom` fallback) is explicit about what to do if the helper doesn't accept the call shape and is resolved inline during implementation, not left as a follow-up.

**Type consistency check:**
- `OperationsSourceType = 'maintenance_request' | 'work_order' | 'reservation'` — defined in T1, used in T2, T3, T6.
- `CreateValue = 'request' | 'work-order' | 'reservation'` — T11, T12.
- `WorkOrderListResponse`, `ReservationListResponse` — T6 defines, T11 consumes.
- `cta.label` / `cta.createValue` — T11 defines, consumed in both CTA button and empty-state action.
- `isAdmin: boolean` on `OperationsHubProps` — T11 defines, T12 uses.
- `userId: string` on `OperationsHubProps` — T11 defines, passed to `<RequestCreateSheet>`.
- `legacyHrefFor(value, communityId)` — T11 defines, referenced only in the rollback branch.

**Scope discipline:** Phase 2 adds one new env var, one new CI-test fixture file set, and ~9 new source files. No migrations. No CI job additions. Preview click-through uses the existing `preview_*` workflow — no new tooling.

**Decision points the agent will hit during execution (called out upfront so they don't stall):**
1. `scoped.countFrom(table, where)` signature may differ. T4.3 tells the agent to match existing patterns in the same file via grep.
2. If the test in T5.1 triggers "duplicate vi.mock" errors, split into two files. T5.1 notes this explicitly.
3. `toZonedIsoString` in T10.4 uses Intl-only, not `date-fns-tz`. If the latter is already a dependency, the agent may substitute `zonedTimeToUtc(new Date(...), timezone).toISOString()`, which is more idiomatic. Acceptable substitution.
4. Integration test at `apps/web/__tests__/integration/work-orders-amenities.integration.test.ts` may rely on the old array return shape. T4.6 tells the agent to update its assertion to `.data` accessing.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-23-operations-remediation-phase-2.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration on each task's scope. The cross-cutting nature of T11 (hub rewrite) benefits most from a dedicated review checkpoint before T12.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach?**
