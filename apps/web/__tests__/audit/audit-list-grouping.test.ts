/**
 * How the audit list collapses entries into one line. Routine entries collapse
 * by kind; anything else only when it is an exact repeat (same person, same
 * item, same day), so a record printed five times reads as one line while two
 * different deletions stay two.
 */
import { describe, expect, it } from 'vitest';
import { buildAuditListItems } from '../../src/components/audit/AuditEntry';
import type { DescribeContext } from '../../src/lib/audit/describe-event';
import type { AuditLogEntry } from '../../src/lib/audit/types';

const MARIA = '11111111-1111-1111-1111-111111111111';
const ANA = '22222222-2222-2222-2222-222222222222';

const ctx: DescribeContext = {
  users: { [MARIA]: 'Maria Lopez', [ANA]: 'Ana Ruiz' },
  resources: {},
  timeZone: 'America/New_York',
};

let nextId = 100;
function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  nextId -= 1;
  return {
    id: nextId,
    userId: MARIA,
    communityId: 7,
    action: 'audit_evidence_generated',
    resourceType: 'user',
    resourceId: ANA,
    oldValues: null,
    newValues: null,
    metadata: { scopeLabel: 'Ana Ruiz', entryCount: 5 },
    createdAt: '2026-11-02T14:00:00.000Z',
    ...overrides,
  };
}

describe('buildAuditListItems', () => {
  it('collapses an exact repeat into one line that keeps every entry', () => {
    const items = buildAuditListItems([entry(), entry(), entry()], ctx);
    expect(items).toHaveLength(1);
    expect(items[0]!.group?.count).toBe(3);
    expect(items[0]!.entries).toHaveLength(3);
  });

  it('keeps important entries about different items on separate lines', () => {
    const items = buildAuditListItems(
      [
        entry({ action: 'document_deleted', resourceType: 'document', resourceId: '1', metadata: null }),
        entry({ action: 'document_deleted', resourceType: 'document', resourceId: '2', metadata: null }),
      ],
      ctx,
    );
    expect(items).toHaveLength(2);
  });

  it('keeps the same action by different people on separate lines', () => {
    const items = buildAuditListItems([entry(), entry({ userId: ANA })], ctx);
    expect(items).toHaveLength(2);
  });

  it('keeps repeats on different days on separate lines', () => {
    const items = buildAuditListItems([entry(), entry({ createdAt: '2026-11-01T14:00:00.000Z' })], ctx);
    expect(items).toHaveLength(2);
  });

  it('still collapses routine entries by kind across people and items', () => {
    const opened = (userId: string, resourceId: string) =>
      entry({ action: 'document_accessed', resourceType: 'document', resourceId, userId, metadata: null });
    const items = buildAuditListItems([opened(MARIA, '1'), opened(ANA, '2')], ctx);
    expect(items).toHaveLength(1);
    expect(items[0]!.group?.actorText).toBe('Maria Lopez and 1 other');
  });
});
