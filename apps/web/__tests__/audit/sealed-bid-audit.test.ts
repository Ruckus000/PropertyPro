/**
 * Sealed bids in the audit trail (owner decision 2026-11-24, "Hide them until
 * closing").
 *
 * Adding a bid writes its vendor and amount into a `contract_bid` audit entry.
 * The entry is still written as it always was; what a manager can READ before
 * the contract's bidding closes must not include what the bid said. This file
 * runs every read that hands audit rows out of the server, for real (the real
 * route, the real print page, the real service, the real describer), over a
 * stand-in scoped client:
 *
 *   - the list API (which also feeds the entry sheet, the compliance activity
 *     feed and every scoped view: they are the same request),
 *   - the CSV download,
 *   - the printable record.
 */
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auditRows: [] as Record<string, unknown>[],
  contractRows: [] as Record<string, unknown>[],
  contractLookups: 0,
  logAuditEvent: vi.fn(),
}));

function chain(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.orderBy = () => builder;
  builder.limit = (n: number) => Promise.resolve(rows.slice(0, n));
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return builder;
}

vi.mock('@propertypro/db', async () => {
  const schema = await import('../../../../packages/db/src/schema');
  return {
    ...schema,
    // The list path: one page, newest first, as paginate() returns it.
    paginate: vi.fn(async () => ({
      data: h.auditRows,
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    })),
    logAuditEvent: h.logAuditEvent,
    createScopedClient: () => ({
      selectFrom: (table: unknown) => {
        if (table === schema.complianceAuditLog) return chain(h.auditRows);
        if (table === schema.contracts) {
          h.contractLookups += 1;
          return chain(h.contractRows);
        }
        return chain([]);
      },
    }),
  };
});

const MANAGER = {
  userId: 'manager-1',
  communityId: 42,
  role: 'property_manager',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
  timezone: 'America/New_York',
  communityName: 'Sunset Condos',
  city: 'Miami',
  state: 'FL',
  subscriptionStatus: 'active',
  subscriptionCanceledAt: null,
  freeAccessExpiresAt: null,
};

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: async () => 'manager-1' }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: async () => MANAGER }));
vi.mock('@/lib/utils/resolve-users', () => ({
  resolveUserDisplayNames: async () => new Map([['manager-1', 'Maria Lopez']]),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'sec-fetch-site': 'same-origin' }) }));
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: async () => 'manager-1' }));
vi.mock('@/lib/request/page-community-context', () => ({ requirePageCommunityMembership: async () => MANAGER }));
vi.mock('@/components/audit/AuditPrintActions', () => ({ AuditPrintActions: () => null }));

import { GET } from '../../src/app/api/v1/audit-trail/route';
import AuditPrintPage from '../../src/app/(print)/audit-trail/print/page';
import { describeAuditEvent } from '../../src/lib/audit/describe-event';
import { sealBidAuditRows, SEALED_BID_DETAILS } from '../../src/lib/audit/redact';
import type { AuditLogEntry } from '../../src/lib/audit/types';

const DAY = 86_400_000;
/** Everything the two bids said. None of it may leave the server while sealed. */
const SECRETS = ['Zephyr Roofing', 'Quarry Builders', '48250', '48,250', '51900', '51,900', 'Includes tear-off'];

function bidRow(id: number, vendorName: string, bidAmount: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    userId: 'manager-1',
    communityId: 42,
    action: 'create',
    resourceType: 'contract_bid',
    resourceId: String(id),
    oldValues: null,
    newValues: { contractId: 7, vendorName, bidAmount, ...extra },
    metadata: { requestId: `req-${id}` },
    createdAt: new Date('2026-11-20T15:00:00Z'),
  };
}

const DOCUMENT_ROW = {
  id: 1,
  userId: 'manager-1',
  communityId: 42,
  action: 'update',
  resourceType: 'document',
  resourceId: '10',
  oldValues: { title: 'Budget draft' },
  newValues: { title: 'Budget 2027', vendorName: 'Not a bid: left alone' },
  metadata: null,
  createdAt: new Date('2026-11-19T15:00:00Z'),
};

function contract(closesAt: Date | null | string, id = 7) {
  return { id, title: 'Roof replacement', biddingClosesAt: closesAt };
}

async function listPayload() {
  const res = await GET(new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42'));
  expect(res.status).toBe(200);
  return res.text();
}
async function csvText() {
  const res = await GET(new NextRequest('http://localhost:3000/api/v1/audit-trail?communityId=42&format=csv'));
  expect(res.status).toBe(200);
  return res.text();
}
async function printHtml() {
  const element = (await AuditPrintPage({ searchParams: Promise.resolve({ communityId: '42' }) })) as ReactElement;
  return renderToStaticMarkup(element);
}

function expectNoSecrets(text: string) {
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

describe('bid entries in the audit trail', () => {
  beforeEach(() => {
    h.logAuditEvent.mockReset();
    h.contractLookups = 0;
    h.auditRows = [
      bidRow(3, 'Quarry Builders', '51900.50'),
      bidRow(2, 'Zephyr Roofing', '48250.00', { notes: 'Includes tear-off' }),
      DOCUMENT_ROW,
    ];
    h.contractRows = [contract(new Date(Date.now() + DAY))];
  });

  describe('while the contract is sealed', () => {
    it('list API: no bid vendor, amount or note; the entry still names the contract and says it is sealed', async () => {
      const body = await listPayload();
      expectNoSecrets(body);

      const entries = (JSON.parse(body) as { data: { data: AuditLogEntry[] } }).data.data;
      const bid = entries.find((e) => e.id === 2)!;
      expect(bid.action).toBe('create');
      expect(bid.newValues).toMatchObject({ contractId: 7, contract: 'Roof replacement', bidDetails: SEALED_BID_DETAILS });
      expect(typeof bid.newValues!['biddingClosesAt']).toBe('string');
    });

    it('entry detail: what the sheet shows for a sealed bid is the contract, "sealed" and the closing time', async () => {
      const entries = (JSON.parse(await listPayload()) as { data: { data: AuditLogEntry[] } }).data.data;
      const described = describeAuditEvent(entries.find((e) => e.id === 2)!, {
        users: { 'manager-1': 'Maria Lopez' },
        resources: {},
        timeZone: 'America/New_York',
      });

      expectNoSecrets(JSON.stringify(described));
      expect(described.sentence).toContain('recorded');
      expect(described.changes.map((c) => c.label)).toEqual(['Contract', 'Bid details', 'Bidding closes at']);
      expect(described.changes[1]!.after).toBe(SEALED_BID_DETAILS);
    });

    it('CSV download: no bid vendor, amount or note anywhere in the file', async () => {
      // The file prints each entry's metadata and its sentence, not its values,
      // so today a bid's details could only reach it through metadata. Nothing
      // writes them there; this entry has them there so the file is really tested.
      h.auditRows = [
        { ...bidRow(2, 'Zephyr Roofing', '48250.00'), metadata: { requestId: 'req-2', vendorName: 'Zephyr Roofing', notes: 'Includes tear-off' } },
        DOCUMENT_ROW,
      ];
      const csv = await csvText();
      expectNoSecrets(csv);
      expect(csv).toContain('contract_bid');
    });

    it('printable record: no bid vendor, amount or note anywhere in the HTML', async () => {
      const html = await printHtml();
      expectNoSecrets(html);
      // The bid entries are still on the record; only what they said is withheld.
      expect(html).toContain(SEALED_BID_DETAILS);
      expect(html).toContain('Roof replacement');
    });

    it('an entry of another kind is untouched, even with a key a bid would have', async () => {
      const body = await listPayload();
      expect(body).toContain('Not a bid: left alone');
      expect(body).toContain('Budget 2027');
      expect(await printHtml()).toContain('Budget 2027');
    });

    it('looks the contracts up once for a page with several bid entries, on each read', async () => {
      await listPayload();
      expect(h.contractLookups).toBe(1);
      await csvText();
      expect(h.contractLookups).toBe(2);
      await printHtml();
      expect(h.contractLookups).toBe(3);
    });

    it('makes no contract lookup at all for a page with no bid entries', async () => {
      h.auditRows = [DOCUMENT_ROW];
      await listPayload();
      await csvText();
      expect(h.contractLookups).toBe(0);
    });
  });

  describe('after bidding has closed', () => {
    beforeEach(() => {
      h.contractRows = [contract(new Date(Date.now() - DAY))];
    });

    it('the same entries show what the bids said, on every read', async () => {
      const body = await listPayload();
      expect(body).toContain('Zephyr Roofing');
      expect(body).toContain('48250.00');
      expect(body).toContain('Includes tear-off');
      expect(body).not.toContain(SEALED_BID_DETAILS);

      const html = await printHtml();
      expect(html).toContain('Zephyr Roofing');
      expect(html).toContain('Quarry Builders');
      expect(html).not.toContain(SEALED_BID_DETAILS);
    });

    it('a contract with no closing time was never sealed', async () => {
      h.contractRows = [contract(null)];
      expect(await listPayload()).toContain('Zephyr Roofing');
    });
  });

  describe('fails closed', () => {
    it('a bid whose contract cannot be found is redacted on every read', async () => {
      h.contractRows = [];
      expectNoSecrets(await listPayload());
      expectNoSecrets(await csvText());
      expectNoSecrets(await printHtml());
    });

    it('a contract whose closing time cannot be read keeps its bids redacted', async () => {
      for (const unreadable of [new Date('garbage'), '2020-01-01T00:00:00.000Z']) {
        h.contractRows = [contract(unreadable)];
        expectNoSecrets(await listPayload());
      }
    });

    it('a bid entry that names no contract is redacted, and needs no lookup', () => {
      const row = { ...bidRow(9, 'Zephyr Roofing', '48250.00'), newValues: { vendorName: 'Zephyr Roofing', bidAmount: '48250.00' } };
      const [sealed] = sealBidAuditRows([row], new Map(), new Date());
      expectNoSecrets(JSON.stringify(sealed));
      expect(sealed!.newValues).toEqual({ bidDetails: SEALED_BID_DETAILS });
    });

    it('anything a bid said that turned up in old values or metadata is withheld too', () => {
      const row = {
        ...bidRow(9, 'Zephyr Roofing', '48250.00'),
        oldValues: { vendorName: 'Quarry Builders' },
        metadata: { requestId: 'req-9', notes: 'Includes tear-off' },
      };
      const [sealed] = sealBidAuditRows([row], new Map([[7, contract(new Date(Date.now() + DAY))]]), new Date());
      expectNoSecrets(JSON.stringify(sealed));
      expect(sealed!.metadata).toEqual({ requestId: 'req-9' });
    });
  });

  it('producing the printed record is still logged, and the log entry says nothing a bid said', async () => {
    await printHtml();
    expect(h.logAuditEvent).toHaveBeenCalledTimes(1);
    expectNoSecrets(JSON.stringify(h.logAuditEvent.mock.calls[0]![0]));
  });
});
