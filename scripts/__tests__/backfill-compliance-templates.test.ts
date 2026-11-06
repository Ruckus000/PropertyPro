import { describe, expect, it, vi } from 'vitest';

// The script is a data repair that a person later points at production. These
// pin its argument contract and its plan; the database is mocked away so that
// importing the module touches nothing.
vi.mock('@propertypro/db', () => ({
  communities: {},
  complianceChecklistItems: {},
  logAuditEvent: vi.fn(),
}));
vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));
vi.mock('@propertypro/db/unsafe', () => ({
  closeUnscopedClient: vi.fn(),
  createUnscopedClient: vi.fn(() => {
    throw new Error('the database must not be reached in these tests');
  }),
}));

import { CONDO_718_CHECKLIST_TEMPLATE, type ComplianceTemplateItem } from '@propertypro/shared';
import {
  UsageError,
  describeTarget,
  parseArgs,
  planCommunity,
  type ExistingRow,
} from '../backfill-compliance-templates';

function rowFor(item: ComplianceTemplateItem, id: number, overrides: Partial<ExistingRow> = {}): ExistingRow {
  return {
    id,
    templateKey: item.templateKey,
    title: item.title,
    description: item.description,
    category: item.category,
    statuteReference: item.statuteReference,
    isConditional: item.isConditional ?? false,
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('is a dry run by default', () => {
    expect(parseArgs([])).toEqual({ apply: false, communityIds: [], operator: null });
  });

  it('refuses --apply without --operator', () => {
    expect(() => parseArgs(['--apply'])).toThrow(UsageError);
    expect(parseArgs(['--apply', '--operator', 'Pat Lee'])).toEqual({
      apply: true,
      communityIds: [],
      operator: 'Pat Lee',
    });
  });

  it('takes repeated --community ids, once each, and refuses anything else', () => {
    expect(parseArgs(['--community', '12', '--community=31', '--community', '12']).communityIds).toEqual([12, 31]);
    expect(() => parseArgs(['--community', '0'])).toThrow(UsageError);
    expect(() => parseArgs(['--community', 'abc'])).toThrow(UsageError);
    expect(() => parseArgs(['--force'])).toThrow(UsageError);
  });
});

describe('describeTarget', () => {
  it('names host, port and database, never the credentials', () => {
    const target = describeTarget('postgresql://admin:s3cret@db.example.com:6543/prod?sslmode=require');
    expect(target).toBe('host db.example.com · port 6543 · database prod');
    expect(target).not.toContain('s3cret');
  });
});

describe('planCommunity', () => {
  const template = CONDO_718_CHECKLIST_TEMPLATE;

  it('plans nothing for a community already in line with the template', () => {
    const rows = template.map((item, index) => rowFor(item, index + 1));
    expect(planCommunity(template, rows)).toEqual({ inserts: [], updates: [] });
  });

  it('inserts every template row the community lacks', () => {
    const rows = template.slice(0, 3).map((item, index) => rowFor(item, index + 1));
    const plan = planCommunity(template, rows);
    expect(plan.inserts.map((item) => item.templateKey)).toEqual(
      template.slice(3).map((item) => item.templateKey),
    );
    expect(plan.updates).toEqual([]);
  });

  it('changes only the fields that differ, and records them before and after', () => {
    const affidavits = template.find((item) => item.templateKey === '718_affidavits')!;
    const rows = template.map((item, index) =>
      item === affidavits
        ? rowFor(item, 99, { statuteReference: '§718.111(12)(g)(2)(g)' })
        : rowFor(item, index + 1),
    );

    const plan = planCommunity(template, rows);

    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toEqual([
      {
        id: 99,
        templateKey: '718_affidavits',
        before: { statuteReference: '§718.111(12)(g)(2)(g)' },
        after: { statuteReference: '§718.111(12)(g)(2)(r)' },
      },
    ]);
  });

  it('treats a null description and an empty template description as different', () => {
    const declaration = template[0]!;
    const rows = template.map((item, index) =>
      item === declaration ? rowFor(item, 1, { description: null }) : rowFor(item, index + 1),
    );
    expect(planCommunity(template, rows).updates.map((update) => update.templateKey)).toEqual([
      declaration.templateKey,
    ]);
  });
});
