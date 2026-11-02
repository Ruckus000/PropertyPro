/**
 * The audit trail shows managers sentences built by describeAuditEvent. These
 * tests pin what a non-technical reader sees: names instead of ids, no raw
 * action codes, only meaningful changed fields, and the two cases that carry
 * trust weight (support sessions and database repairs) said out loud.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dayHeading,
  describeAuditEvent,
  describeChanges,
  type DescribeContext,
} from '../../src/lib/audit/describe-event';
import type { AuditLogEntry } from '../../src/lib/audit/types';

const MARIA = '11111111-1111-1111-1111-111111111111';
const ANA = '22222222-2222-2222-2222-222222222222';

const ctx: DescribeContext = {
  users: { [MARIA]: 'Maria Lopez', [ANA]: 'Ana Ruiz' },
  resources: {},
  timeZone: 'America/New_York',
};

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    userId: MARIA,
    communityId: 7,
    action: 'create',
    resourceType: 'document',
    resourceId: '482',
    oldValues: null,
    newValues: null,
    metadata: null,
    createdAt: '2026-11-01T14:02:41.000Z',
    ...overrides,
  };
}

/** Every member of the AuditAction union, read from its source. */
function auditActions(): string[] {
  const src = readFileSync(resolve(__dirname, '../../../../packages/db/src/utils/audit-logger.ts'), 'utf8');
  const start = src.indexOf('export type AuditAction =');
  const end = src.indexOf(';', src.indexOf("'data_repair'", start));
  const block = src
    .slice(start, end)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return Array.from(block.matchAll(/'([^']+)'/g), (m) => m[1]!);
}

describe('describeAuditEvent', () => {
  it('has a written phrase for every AuditAction, so no raw code reaches the page', () => {
    const actions = auditActions();
    expect(actions.length).toBeGreaterThan(80); // the scan found the union
    expect(actions).toContain('audit_evidence_generated');
    for (const action of actions) {
      const { sentence } = describeAuditEvent(entry({ action, resourceType: 'community' }), ctx);
      expect(sentence, action).not.toContain('did “');
      expect(sentence, action).not.toContain(action.includes('_') ? action : '\u0000');
    }
  });

  it('control: an action outside the union falls back to readable words', () => {
    const { sentence } = describeAuditEvent(entry({ action: 'mystery_thing_happened' }), ctx);
    expect(sentence).toBe('Maria Lopez did “mystery thing happened”');
  });

  it('names the actor and the item, and lets the item narrow the page', () => {
    const described = describeAuditEvent(entry({ newValues: { title: 'Budget 2026.pdf' } }), ctx);
    expect(described.sentence).toBe('Maria Lopez posted the document Budget 2026.pdf');
    expect(described.object).toEqual({
      label: 'Budget 2026.pdf',
      scope: { kind: 'item', entityType: 'document', resourceId: '482' },
    });
  });

  it('prefers the server-resolved name over the snapshot in the row', () => {
    const described = describeAuditEvent(
      entry({ action: 'document_accessed', metadata: { fileName: 'old-name.pdf' } }),
      { ...ctx, resources: { 'document:482': { name: 'Budget 2026.pdf' } } },
    );
    expect(described.object?.label).toBe('Budget 2026.pdf');
    expect(described.routine).toBe(true);
  });

  it('reads a deletion as one, with a badge and a compliance hint', () => {
    const described = describeAuditEvent(
      entry({ action: 'delete', oldValues: { title: '2025 Reserve Study.pdf', filePath: 'x/y.pdf' } }),
      ctx,
    );
    expect(described.sentence).toBe('Maria Lopez deleted the document 2025 Reserve Study.pdf');
    expect(described.badge).toEqual({ tone: 'danger', label: 'Deleted' });
    expect(described.note?.text).toMatch(/compliance checklist/);
  });

  it('never shows a raw user id for someone who has left', () => {
    const described = describeAuditEvent(entry({ userId: '99999999-0000-0000-0000-000000000000' }), ctx);
    expect(described.actor.name).toBe('A former member');
    expect(described.sentence).not.toContain('99999999');
  });

  it("treats the lookup's 'User <id>' placeholder as someone who has left", () => {
    const gone = '99999999-0000-0000-0000-000000000000';
    const described = describeAuditEvent(entry({ userId: gone }), { ...ctx, users: { ...ctx.users, [gone]: 'User 99999999' } });
    expect(described.actor.name).toBe('A former member');
    expect(described.sentence).not.toContain('99999999');
  });

  it('describes an access change around the person it changed', () => {
    const described = describeAuditEvent(
      entry({
        action: 'role_assigned',
        resourceType: 'community',
        resourceId: '7',
        newValues: { userId: ANA, role: 'property_manager' },
      }),
      ctx,
    );
    expect(described.sentence).toBe('Maria Lopez made Ana Ruiz a property manager');
    expect(described.object?.scope).toEqual({ kind: 'person', userId: ANA });
    expect(described.badge?.label).toBe('Access');
  });

  it('says plainly when PropertyPro support made a change', () => {
    const described = describeAuditEvent(
      entry({ action: 'update', metadata: { support: { sessionId: 5, adminUserId: 'admin-1' } }, newValues: { title: 'Rules.pdf' } }),
      ctx,
    );
    expect(described.actor.viaSupport).toBe(true);
    expect(described.sentence).toMatch(/^PropertyPro support \(signed in as Maria Lopez\) updated/);
    expect(described.badge?.label).toBe('Support');
    expect(described.note?.text).toMatch(/signed in as Maria Lopez/);
  });

  it('control: an ordinary change does not mention support', () => {
    const described = describeAuditEvent(entry({ action: 'update', newValues: { title: 'Rules.pdf' } }), ctx);
    expect(described.actor.viaSupport).toBe(false);
    expect(described.sentence).not.toMatch(/support/i);
  });

  it('attributes a database repair to PropertyPro and keeps the recorded reason', () => {
    const described = describeAuditEvent(
      entry({
        userId: null,
        action: 'data_repair',
        resourceType: 'communities',
        oldValues: { deleted_at: '2026-08-09T03:56:22.299785+00:00' },
        newValues: { deleted_at: null },
        metadata: { reason: 'restore access after the 2026-08-09 sweep' },
      }),
      ctx,
    );
    expect(described.actor).toMatchObject({ kind: 'platform', name: 'PropertyPro support' });
    expect(described.sentence).not.toContain('data_repair');
    expect(described.note?.text).toContain('restore access after the 2026-08-09 sweep');
    expect(described.changes).toEqual([
      { label: 'Deleted', before: 'Aug 8, 2026 at 11:56 PM EDT', after: 'No' },
    ]);
  });

  it('says "1 hour", not "1 hours", for a notice posted just over an hour ahead', () => {
    const described = describeAuditEvent(
      entry({
        action: 'meeting_notice_posted',
        resourceType: 'meeting',
        resourceId: '9',
        newValues: { noticePostedAt: '2026-11-01T12:00:00.000Z' },
      }),
      { ...ctx, resources: { 'meeting:9': { name: 'Board meeting', startsAt: '2026-11-01T13:30:00.000Z' } } },
    );
    expect(described.sentence).toBe('Maria Lopez posted the notice for Board meeting 1 hour before the meeting');
  });

  it('says how far ahead a meeting notice went out when the meeting date is known', () => {
    const described = describeAuditEvent(
      entry({
        action: 'meeting_notice_posted',
        resourceType: 'meeting',
        resourceId: '9',
        newValues: { noticePostedAt: '2026-11-01T12:30:00.000Z' },
      }),
      { ...ctx, resources: { 'meeting:9': { name: 'Nov 18 board meeting', startsAt: '2026-11-18T23:00:00.000Z' } } },
    );
    expect(described.sentence).toBe('Maria Lopez posted the notice for Nov 18 board meeting 17 days before the meeting');
  });

  it('never shows the contents of a ballot', () => {
    const described = describeAuditEvent(
      entry({ action: 'ballot_cast', resourceType: 'election_ballot_submission', newValues: { choice: 'Candidate A' } }),
      ctx,
    );
    expect(described.changes).toEqual([]);
  });
});

describe('describeChanges', () => {
  it('shows only changed, meaningful fields in plain words', () => {
    const changes = describeChanges(
      entry({
        action: 'update',
        oldValues: { id: 3, communityId: 7, title: 'Budget', isPinned: false, amountCents: 12500, updatedAt: 'x' },
        newValues: { id: 3, communityId: 7, title: 'Budget', isPinned: true, amountCents: 13000, updatedAt: 'y' },
      }),
      ctx,
    );
    expect(changes).toEqual([
      { label: 'Pinned', before: 'No', after: 'Yes' },
      { label: 'Amount', before: '$125.00', after: '$130.00' },
    ]);
  });

  it('gives a creation only "after" values', () => {
    const changes = describeChanges(entry({ newValues: { title: 'Rules.pdf', fileSize: 438_000 } }), ctx);
    expect(changes).toEqual([
      { label: 'Title', before: null, after: 'Rules.pdf' },
      { label: 'File size', before: null, after: '428 KB' },
    ]);
  });
});

describe('dayHeading', () => {
  const now = new Date('2026-11-01T16:00:00.000Z'); // Nov 1, noon in New York
  const tz = 'America/New_York';

  it('uses Today, Yesterday, then weekday names, then dates', () => {
    expect(dayHeading('2026-11-01T13:00:00.000Z', tz, now)).toBe('Today');
    expect(dayHeading('2026-10-31T20:00:00.000Z', tz, now)).toBe('Yesterday');
    expect(dayHeading('2026-10-30T14:00:00.000Z', tz, now)).toBe('Friday, Oct 30');
    expect(dayHeading('2026-10-21T14:00:00.000Z', tz, now)).toBe('Oct 21');
    expect(dayHeading('2025-12-24T14:00:00.000Z', tz, now)).toBe('Dec 24, 2025');
  });

  it('still says Yesterday in the first hour after the clocks spring forward', () => {
    // 00:30 EDT on Mon Mar 15, 2027; 24 hours earlier was 23:30 EST on Mar 13.
    const afterChange = new Date('2027-03-15T04:30:00.000Z');
    expect(dayHeading('2027-03-14T15:00:00.000Z', tz, afterChange)).toBe('Yesterday');
  });

  it('groups by the community’s calendar day, not UTC', () => {
    // 02:00 UTC on Nov 1 is still Oct 31 in New York.
    expect(dayHeading('2026-11-01T02:00:00.000Z', tz, now)).toBe('Yesterday');
  });
});
