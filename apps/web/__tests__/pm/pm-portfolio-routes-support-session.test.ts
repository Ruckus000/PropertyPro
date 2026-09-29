/**
 * EVERY route verb behind `requirePmPortfolioAccess` refuses a support session.
 *
 * The gate is the single place the refusal lives (lib/api/pm-portfolio-access.ts),
 * so this drives each real route module — through its contract runner, with a
 * body/params/query that passes validation — and asserts the 403 carries the
 * support message. `isPmAdminInAnyCommunity` is mocked TRUE, so the only way to
 * get that message is the support refusal; it is also asserted never reached,
 * because the refusal runs before the portfolio lookup.
 *
 * Mocked at the same boundaries as bulk-documents-route.test.ts: the session
 * (`requireAuthenticatedUserId`) and the portfolio predicate.
 *
 * The final case pins the inventory: the set of route files that call the gate
 * (including the `gateUser` wrappers) must equal the set covered here, so a new
 * caller fails this file until it is added.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { requireAuthenticatedUserIdMock, isPmAdminInAnyCommunityMock } = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

// Both DB entry points read DATABASE_URL at import, so they are mocked to keep
// this file in the DB-less unit job. Nothing on them but the portfolio
// predicate is reached: the refusal comes before any other work.
vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
}));
vi.mock('@propertypro/db', () => ({}));

import * as bulkAnnouncements from '../../src/app/api/v1/pm/bulk/announcements/route';
import * as bulkDocuments from '../../src/app/api/v1/pm/bulk/documents/route';
import * as templates from '../../src/app/api/v1/pm/portfolio/templates/route';
import * as templateApply from '../../src/app/api/v1/pm/portfolio/templates/[id]/apply/route';
import * as pmCommunities from '../../src/app/api/v1/pm/communities/route';
import * as pmReports from '../../src/app/api/v1/pm/reports/[reportType]/route';
import * as pmDashboardSummary from '../../src/app/api/v1/pm/dashboard/summary/route';
import * as billingGroupsMine from '../../src/app/api/v1/billing-groups/mine/route';

type Handler = (req: NextRequest, ctx?: unknown) => Promise<Response>;

interface Case {
  /** Route file, relative to src/app/api/v1. */
  file: string;
  verb: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  handler: Handler;
  path: string;
  body?: unknown;
  params?: Record<string, string>;
}

const CASES: Case[] = [
  {
    file: 'pm/bulk/announcements/route.ts',
    verb: 'POST',
    handler: bulkAnnouncements.POST as Handler,
    path: '/api/v1/pm/bulk/announcements',
    body: { communityIds: [1], title: 'Notice', body: 'Hello' },
  },
  {
    file: 'pm/bulk/documents/route.ts',
    verb: 'POST',
    handler: bulkDocuments.POST as Handler,
    path: '/api/v1/pm/bulk/documents',
    body: {
      communityIds: [1],
      documents: [{ fileName: 'a.pdf', storagePath: 'communities/1/documents/a.pdf' }],
    },
  },
  {
    file: 'pm/portfolio/templates/route.ts',
    verb: 'GET',
    handler: templates.GET as Handler,
    path: '/api/v1/pm/portfolio/templates',
  },
  {
    file: 'pm/portfolio/templates/route.ts',
    verb: 'POST',
    handler: templates.POST as Handler,
    path: '/api/v1/pm/portfolio/templates',
    body: { communityId: 1, name: 'Template' },
  },
  {
    file: 'pm/portfolio/templates/route.ts',
    verb: 'PATCH',
    handler: templates.PATCH as Handler,
    path: '/api/v1/pm/portfolio/templates',
    body: { id: 1, name: 'Renamed' },
  },
  {
    file: 'pm/portfolio/templates/route.ts',
    verb: 'DELETE',
    handler: templates.DELETE as Handler,
    path: '/api/v1/pm/portfolio/templates',
    body: { id: 1 },
  },
  {
    file: 'pm/portfolio/templates/[id]/apply/route.ts',
    verb: 'POST',
    handler: templateApply.POST as Handler,
    path: '/api/v1/pm/portfolio/templates/1/apply',
    body: { communityIds: [1] },
    params: { id: '1' },
  },
  {
    file: 'pm/communities/route.ts',
    verb: 'GET',
    handler: pmCommunities.GET as Handler,
    path: '/api/v1/pm/communities',
  },
  {
    file: 'pm/communities/route.ts',
    verb: 'POST',
    handler: pmCommunities.POST as Handler,
    path: '/api/v1/pm/communities',
    body: {
      name: 'New Condo',
      communityType: 'condo_718',
      planId: 'essentials',
      addressLine1: '1 Ocean Dr',
      city: 'Miami',
      state: 'FL',
      zipCode: '33139',
      subdomain: 'new-condo',
      unitCount: 10,
    },
  },
  {
    file: 'pm/reports/[reportType]/route.ts',
    verb: 'GET',
    handler: pmReports.GET as Handler,
    path: '/api/v1/pm/reports/compliance',
    params: { reportType: 'compliance' },
  },
  {
    file: 'pm/dashboard/summary/route.ts',
    verb: 'GET',
    handler: pmDashboardSummary.GET as Handler,
    path: '/api/v1/pm/dashboard/summary',
  },
  {
    file: 'billing-groups/mine/route.ts',
    verb: 'GET',
    handler: billingGroupsMine.GET as Handler,
    path: '/api/v1/billing-groups/mine',
  },
];

const SUPPORT_HEADERS = {
  'x-support-session-id': '42',
  'x-support-community-id': '1',
  'x-community-id': '1',
};

function buildRequest(c: Case): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: c.verb,
    headers: { ...SUPPORT_HEADERS },
  };
  if (c.body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(c.body);
  }
  return new NextRequest(`http://localhost:3000${c.path}`, init);
}

describe('requirePmPortfolioAccess routes refuse a support session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-user-1');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
  });

  it.each(CASES.map((c) => [`${c.verb} ${c.file}`, c] as const))(
    '%s → 403 with the support message',
    async (_label, c) => {
      const res = await c.handler(
        buildRequest(c),
        c.params ? { params: Promise.resolve(c.params) } : undefined,
      );

      // Refused BEFORE the portfolio lookup — checked first, so a missing
      // refusal reads as "the gate went on to the portfolio lookup".
      expect(requireAuthenticatedUserIdMock).toHaveBeenCalledTimes(1);
      expect(isPmAdminInAnyCommunityMock).not.toHaveBeenCalled();
      expect(res.status).toBe(403);
      const json = (await res.json()) as { error?: { message?: string } };
      expect(json.error?.message).toBe('Not available during a support session');
    },
  );

  it('covers every route file that calls requirePmPortfolioAccess', () => {
    const apiRoot = join(__dirname, '../../src/app/api/v1');
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === 'route.ts' && /requirePmPortfolioAccess\(/.test(readFileSync(full, 'utf8'))) {
          callers.push(relative(apiRoot, full).split('\\').join('/'));
        }
      }
    };
    walk(apiRoot);

    expect(callers.length).toBeGreaterThan(0);
    expect([...new Set(CASES.map((c) => c.file))].sort()).toEqual(callers.sort());
  });
});
