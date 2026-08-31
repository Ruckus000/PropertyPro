/**
 * Guards what a manager actually SEES for an out-of-band production data repair.
 *
 * Background: repairs applied with Supabase MCP `execute_sql` bypass
 * logAuditEvent(), so they record nothing unless the statement writes the row
 * itself (see the "Prod data repairs" section of .claude/rules/migration-safety.md).
 * Those rows carry `action: 'data_repair'` and a NULL `user_id`, a combination no
 * app mutation produces — every in-app action has an acting user. This file
 * asserts the reader-facing half renders that combination correctly, because a
 * trail nobody can read is not much better than no trail.
 *
 * No AuditEntry test existed to extend, so this is a new file rather than a
 * parallel one.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { AuditEntry, type AuditLogEntry } from '../../../src/components/audit/AuditEntry';

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    userId: null,
    communityId: 133,
    action: 'data_repair',
    resourceType: 'communities',
    resourceId: '133',
    oldValues: { deleted_at: '2026-08-09T03:56:22.299785+00:00' },
    newValues: { deleted_at: null },
    metadata: { reason: 'restore access after the 2026-08-09 sweep' },
    createdAt: '2026-08-31T15:00:00.000Z',
    ...overrides,
  };
}

describe('AuditEntry — production data repair', () => {
  it('renders the data_repair action with a human label', () => {
    const html = renderToStaticMarkup(<AuditEntry entry={makeEntry()} />);

    // formatAction is generic, so this is really asserting that a snake_case
    // action reaching the UI is presented, not dumped raw.
    expect(html).toContain('Data Repair');
    expect(html).not.toContain('data_repair');
  });

  it('attributes a null-actor entry to "System", not a blank or a crash', () => {
    // Independent of the label assertion above: userId null is the part unique
    // to repairs, and rendering it as an empty "By:" would read as corrupt data.
    const html = renderToStaticMarkup(<AuditEntry entry={makeEntry({ userId: null })} />);

    expect(html).toContain('System');
    expect(html).toMatch(/By:\s*System/);
  });

  it('control: an ordinary entry with an actor does NOT say System', () => {
    // Guards against "System" being hardcoded somewhere and the first two
    // assertions passing for the wrong reason.
    const withActor = renderToStaticMarkup(
      <AuditEntry
        entry={makeEntry({ userId: 'a1b2c3d4-0000-0000-0000-000000000000', action: 'update' })}
      />,
    );

    expect(withActor).not.toContain('System');
    expect(withActor).toContain('a1b2c3d4');
    expect(withActor).toContain('Update');
  });

  it('surfaces the repair reason from metadata so intent is recoverable', () => {
    const rendered = renderToStaticMarkup(<AuditEntry entry={makeEntry()} />);

    expect(rendered).toContain('Metadata');
    expect(rendered).toContain('restore access after the 2026-08-09 sweep');
  });
});
