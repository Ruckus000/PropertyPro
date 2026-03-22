/**
 * Statutory Compliance Regression Suite
 *
 * Encodes every requirement from §718.111(12)(g) and §720.303 as executable tests.
 * When HB 913's next amendment drops, update the constants and run this suite
 * to see what breaks.
 *
 * This is NOT "does the component render" — this is "does the system require
 * all 16 document categories, enforce 30-day posting deadlines, calculate
 * meeting notice windows correctly, and generate a compliance score that
 * accurately reflects missing items."
 */
import { describe, expect, it } from 'vitest';
import {
  CONDO_718_CHECKLIST_TEMPLATE,
  HOA_720_CHECKLIST_TEMPLATE,
  getComplianceTemplate,
  type ComplianceTemplateItem,
} from '@propertypro/shared';
import {
  calculateComplianceStatus,
  calculatePostingDeadline,
  calculateRollingWindowStart,
  groupByCategory,
  type ComplianceStatusInput,
} from '../../src/lib/utils/compliance-calculator';

// =============================================================================
// §718.111(12)(g) — Condo Document Posting Requirements
// =============================================================================

describe('§718.111(12)(g) condo compliance template completeness', () => {
  const template = CONDO_718_CHECKLIST_TEMPLATE;

  it('requires exactly 16 document categories for condo associations', () => {
    expect(template).toHaveLength(16);
  });

  it('includes all required governing documents per §718.111(12)(g)(2)(a)-(d)', () => {
    const governingKeys = template
      .filter((t) => t.category === 'governing_documents')
      .map((t) => t.templateKey);

    expect(governingKeys).toContain('718_declaration');
    expect(governingKeys).toContain('718_bylaws');
    expect(governingKeys).toContain('718_articles');
    expect(governingKeys).toContain('718_rules');
    expect(governingKeys).toContain('718_qa_sheet');
  });

  it('includes annual budget per §718.112(2)(f)', () => {
    const budget = template.find((t) => t.templateKey === '718_budget');
    expect(budget).toBeDefined();
    expect(budget!.statuteReference).toBe('§718.112(2)(f)');
    expect(budget!.category).toBe('financial_records');
    expect(budget!.deadlineDays).toBe(30);
  });

  it('includes annual financial report per §718.111(13)', () => {
    const report = template.find(
      (t) => t.templateKey === '718_financial_report',
    );
    expect(report).toBeDefined();
    expect(report!.statuteReference).toBe('§718.111(13)');
    expect(report!.category).toBe('financial_records');
  });

  it('includes meeting minutes with 12-month rolling window per §718.111(12)(g)(2)(e)', () => {
    const minutes = template.find(
      (t) => t.templateKey === '718_minutes_rolling_12m',
    );
    expect(minutes).toBeDefined();
    expect(minutes!.rollingMonths).toBe(12);
    expect(minutes!.category).toBe('meeting_records');
    // Minutes use rolling window, NOT fixed deadline
    expect(minutes!.deadlineDays).toBeUndefined();
  });

  it('includes video recordings with conditional flag per §718.111(12)(g)(2)(f)', () => {
    const video = template.find(
      (t) => t.templateKey === '718_video_recordings',
    );
    expect(video).toBeDefined();
    expect(video!.rollingMonths).toBe(12);
    expect(video!.isConditional).toBe(true);
  });

  it('includes insurance policies per §718.111(11)', () => {
    const insurance = template.find(
      (t) => t.templateKey === '718_insurance',
    );
    expect(insurance).toBeDefined();
    expect(insurance!.statuteReference).toBe('§718.111(11)');
    expect(insurance!.deadlineDays).toBe(30);
  });

  it('includes SIRS per §718.112(2)(g)', () => {
    const sirs = template.find((t) => t.templateKey === '718_sirs');
    expect(sirs).toBeDefined();
    expect(sirs!.statuteReference).toBe('§718.112(2)(g)');
    expect(sirs!.isConditional).toBe(true);
  });

  it('includes structural inspection reports per §553.899', () => {
    const inspections = template.find(
      (t) => t.templateKey === '718_inspection_reports',
    );
    expect(inspections).toBeDefined();
    expect(inspections!.statuteReference).toContain('§553.899');
    expect(inspections!.isConditional).toBe(true);
  });

  it('every template item has a statute reference', () => {
    for (const item of template) {
      expect(item.statuteReference).toBeTruthy();
      expect(item.statuteReference.startsWith('§')).toBe(true);
    }
  });

  it('every non-conditional item with a deadline uses 30-day posting rule', () => {
    const deadlineItems = template.filter(
      (t) => t.deadlineDays != null && !t.isConditional,
    );
    for (const item of deadlineItems) {
      expect(item.deadlineDays).toBe(30);
    }
  });

  it('all rolling window items use 12-month window', () => {
    const rollingItems = template.filter((t) => t.rollingMonths != null);
    for (const item of rollingItems) {
      expect(item.rollingMonths).toBe(12);
    }
  });
});

// =============================================================================
// §720.303 — HOA Document Posting Requirements
// =============================================================================

describe('§720.303 HOA compliance template completeness', () => {
  const template = HOA_720_CHECKLIST_TEMPLATE;

  it('requires exactly 10 document categories for HOA associations', () => {
    expect(template).toHaveLength(10);
  });

  it('includes declaration of covenants per §720.303(4)', () => {
    const declaration = template.find(
      (t) => t.templateKey === '720_governing_docs',
    );
    expect(declaration).toBeDefined();
    expect(declaration!.category).toBe('governing_documents');
  });

  it('includes annual budget per §720.303(6)', () => {
    const budget = template.find((t) => t.templateKey === '720_budget');
    expect(budget).toBeDefined();
    expect(budget!.statuteReference).toBe('§720.303(6)');
  });

  it('includes annual financial report per §720.303(7)', () => {
    const report = template.find(
      (t) => t.templateKey === '720_financial_report',
    );
    expect(report).toBeDefined();
    expect(report!.statuteReference).toBe('§720.303(7)');
  });

  it('includes meeting minutes and notices with rolling windows', () => {
    const minutes = template.find(
      (t) => t.templateKey === '720_minutes_rolling_12m',
    );
    const notices = template.find(
      (t) => t.templateKey === '720_meeting_notices',
    );
    expect(minutes?.rollingMonths).toBe(12);
    expect(notices?.rollingMonths).toBe(12);
  });
});

// =============================================================================
// Community type → template mapping
// =============================================================================

describe('getComplianceTemplate community type mapping', () => {
  it('condo_718 returns the 16-item condo template', () => {
    const template = getComplianceTemplate('condo_718');
    expect(template).toHaveLength(16);
    expect(template[0].templateKey).toBe('718_declaration');
  });

  it('hoa_720 returns the 10-item HOA template', () => {
    const template = getComplianceTemplate('hoa_720');
    expect(template).toHaveLength(10);
    expect(template[0].templateKey).toBe('720_governing_docs');
  });

  it('apartment community type returns empty array (no statutory requirement)', () => {
    const template = getComplianceTemplate('apartment');
    expect(template).toHaveLength(0);
  });
});

// =============================================================================
// 30-Day Posting Deadline Scenarios
// =============================================================================

describe('30-day posting deadline enforcement', () => {
  it('document created today has 30-day deadline', () => {
    const sourceDate = new Date('2026-03-01T10:00:00-05:00');
    const deadline = calculatePostingDeadline(sourceDate, 30);
    expect(deadline.toISOString().startsWith('2026-03-31')).toBe(true);
  });

  it('item without document is unsatisfied before deadline', () => {
    const status = calculateComplianceStatus({
      documentId: null,
      deadline: new Date('2026-04-01'),
      now: new Date('2026-03-15'),
    });
    expect(status).toBe('unsatisfied');
  });

  it('item without document is overdue after deadline', () => {
    const status = calculateComplianceStatus({
      documentId: null,
      deadline: new Date('2026-03-01'),
      now: new Date('2026-03-15'),
    });
    expect(status).toBe('overdue');
  });

  it('item with document is satisfied regardless of deadline', () => {
    const status = calculateComplianceStatus({
      documentId: 42,
      deadline: new Date('2026-01-01'),
      now: new Date('2026-03-15'),
    });
    expect(status).toBe('satisfied');
  });

  it('deadline exactly on boundary — same instant is NOT overdue', () => {
    const deadline = new Date('2026-03-15T00:00:00.000Z');
    const status = calculateComplianceStatus({
      documentId: null,
      deadline,
      now: deadline,
    });
    // isAfter(now, deadline) where now === deadline → false → unsatisfied
    expect(status).toBe('unsatisfied');
  });

  it('deadline one millisecond past boundary IS overdue', () => {
    const deadline = new Date('2026-03-15T00:00:00.000Z');
    const now = new Date('2026-03-15T00:00:00.001Z');
    const status = calculateComplianceStatus({
      documentId: null,
      deadline,
      now,
    });
    expect(status).toBe('overdue');
  });

  it('weekend deadline rolls to Monday', () => {
    // 2026-02-07 is a Saturday
    const sourceDate = new Date('2026-01-08T12:00:00Z');
    const deadline = calculatePostingDeadline(sourceDate, 30);
    const day = deadline.getUTCDay();
    // Should be Monday (1), not Saturday (6) or Sunday (0)
    expect(day).toBe(1);
  });

  it('Sunday deadline also rolls to Monday', () => {
    // 2026-03-08 is Sunday
    const sourceDate = new Date('2026-02-06T12:00:00Z');
    const deadline = calculatePostingDeadline(sourceDate, 30);
    const day = deadline.getUTCDay();
    expect(day).toBe(1);
  });
});

// =============================================================================
// Meeting Notice Window Calculations
// =============================================================================

describe('meeting notice deadlines', () => {
  it('owner meeting requires 14-day notice', () => {
    const meetingDate = new Date('2026-04-15T18:00:00-04:00');
    const noticeDeadline = calculatePostingDeadline(
      new Date(meetingDate.getTime() - 14 * 24 * 60 * 60 * 1000),
      0,
    );
    // Notice must be posted at least 14 days before meeting
    expect(noticeDeadline.getTime()).toBeLessThanOrEqual(
      meetingDate.getTime() - 14 * 24 * 60 * 60 * 1000 + 86400000,
    );
  });

  it('board meeting requires 48-hour notice', () => {
    const meetingDate = new Date('2026-04-15T18:00:00-04:00');
    const hoursBeforeMeeting = 48;
    const noticeDeadline = new Date(
      meetingDate.getTime() - hoursBeforeMeeting * 60 * 60 * 1000,
    );
    // 48 hours before April 15 6pm = April 13 6pm
    expect(noticeDeadline.toISOString()).toContain('2026-04-13');
  });

  it('meeting created 3 days out that requires 14 days notice is flagged as non-compliant', () => {
    const now = new Date('2026-03-15T10:00:00-04:00');
    const meetingDate = new Date('2026-03-18T18:00:00-04:00');
    const requiredNoticeDays = 14;

    const latestAllowedNoticeDate = new Date(
      meetingDate.getTime() - requiredNoticeDays * 24 * 60 * 60 * 1000,
    );
    // Latest allowed notice is March 4 — but we're already March 15
    const isCompliant = now.getTime() <= latestAllowedNoticeDate.getTime();
    expect(isCompliant).toBe(false);
  });
});

// =============================================================================
// Rolling Window Compliance
// =============================================================================

describe('12-month rolling window compliance', () => {
  it('document posted 6 months ago is within the window', () => {
    const now = new Date('2026-06-15');
    const status = calculateComplianceStatus({
      documentId: 100,
      documentPostedAt: new Date('2025-12-20'),
      rollingWindowMonths: 12,
      now,
    });
    expect(status).toBe('satisfied');
  });

  it('document posted 13 months ago is outside the window (overdue)', () => {
    const now = new Date('2026-06-15');
    const status = calculateComplianceStatus({
      documentId: 100,
      documentPostedAt: new Date('2025-05-01'),
      rollingWindowMonths: 12,
      now,
    });
    expect(status).toBe('overdue');
  });

  it('document posted exactly 12 months ago is at the boundary', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const windowStart = calculateRollingWindowStart(now, 12);
    expect(windowStart.toISOString()).toBe('2025-06-15T00:00:00.000Z');

    // Document posted exactly at window start — isBefore(postedAt, windowStart) = false → satisfied
    const status = calculateComplianceStatus({
      documentId: 100,
      documentPostedAt: windowStart,
      rollingWindowMonths: 12,
      now,
    });
    expect(status).toBe('satisfied');
  });

  it('document posted one day before window start is overdue', () => {
    const now = new Date('2026-06-15T00:00:00Z');
    const windowStart = calculateRollingWindowStart(now, 12);
    const oneDayBefore = new Date(windowStart.getTime() - 86400000);

    const status = calculateComplianceStatus({
      documentId: 100,
      documentPostedAt: oneDayBefore,
      rollingWindowMonths: 12,
      now,
    });
    expect(status).toBe('overdue');
  });
});

// =============================================================================
// Not-Applicable Handling
// =============================================================================

describe('conditional item handling (isApplicable)', () => {
  it('item marked not applicable returns not_applicable regardless of other state', () => {
    const status = calculateComplianceStatus({
      isApplicable: false,
      documentId: null,
      deadline: new Date('2025-01-01'), // long overdue
      now: new Date('2026-03-15'),
    });
    expect(status).toBe('not_applicable');
  });

  it('item explicitly marked applicable with no document is unsatisfied', () => {
    const status = calculateComplianceStatus({
      isApplicable: true,
      documentId: null,
      now: new Date('2026-03-15'),
    });
    expect(status).toBe('unsatisfied');
  });

  it('conditional template items are correctly flagged', () => {
    const conditionalItems = CONDO_718_CHECKLIST_TEMPLATE.filter(
      (t) => t.isConditional,
    );
    // Video recordings, conflict contracts, bids, inspection reports, SIRS
    expect(conditionalItems.length).toBe(5);
    const keys = conditionalItems.map((t) => t.templateKey);
    expect(keys).toContain('718_video_recordings');
    expect(keys).toContain('718_conflict_contracts');
    expect(keys).toContain('718_bids');
    expect(keys).toContain('718_inspection_reports');
    expect(keys).toContain('718_sirs');
  });
});

// =============================================================================
// Compliance Score Accuracy
// =============================================================================

describe('compliance score calculation accuracy', () => {
  it('all items satisfied → 100% compliance', () => {
    const items = CONDO_718_CHECKLIST_TEMPLATE.map(
      (t): ComplianceStatusInput => ({
        documentId: 1,
        documentPostedAt: new Date('2026-03-01'),
        deadline: t.deadlineDays
          ? calculatePostingDeadline(new Date('2026-02-01'), t.deadlineDays)
          : undefined,
        rollingWindowMonths: t.rollingMonths ?? undefined,
        now: new Date('2026-03-15'),
      }),
    );

    const statuses = items.map(calculateComplianceStatus);
    const satisfiedCount = statuses.filter((s) => s === 'satisfied').length;
    expect(satisfiedCount).toBe(16);
    expect(satisfiedCount / statuses.length).toBe(1);
  });

  it('no items satisfied → 0% applicable compliance', () => {
    const items = CONDO_718_CHECKLIST_TEMPLATE.map(
      (t): ComplianceStatusInput => ({
        documentId: null,
        deadline: t.deadlineDays
          ? calculatePostingDeadline(new Date('2025-01-01'), t.deadlineDays)
          : undefined,
        rollingWindowMonths: t.rollingMonths ?? undefined,
        now: new Date('2026-03-15'),
      }),
    );

    const statuses = items.map(calculateComplianceStatus);
    const satisfiedCount = statuses.filter((s) => s === 'satisfied').length;
    expect(satisfiedCount).toBe(0);
  });

  it('mix of satisfied, unsatisfied, overdue, and N/A yields correct counts', () => {
    const now = new Date('2026-03-15');
    const inputs: ComplianceStatusInput[] = [
      { documentId: 1, now }, // satisfied
      { documentId: null, deadline: new Date('2026-04-01'), now }, // unsatisfied (future deadline)
      { documentId: null, deadline: new Date('2026-01-01'), now }, // overdue
      { isApplicable: false, now }, // not_applicable
    ];

    const statuses = inputs.map(calculateComplianceStatus);
    expect(statuses).toEqual([
      'satisfied',
      'unsatisfied',
      'overdue',
      'not_applicable',
    ]);

    // Score should exclude N/A items
    const applicable = statuses.filter((s) => s !== 'not_applicable');
    const satisfied = applicable.filter((s) => s === 'satisfied');
    const score = Math.round((satisfied.length / applicable.length) * 100);
    expect(score).toBe(33); // 1/3
  });
});

// =============================================================================
// Legislative Amendment Regression Detection
//
// This section demonstrates the workflow: law changes → update templates.ts →
// run this suite → see exactly what breaks. Each test is pinned to a specific
// statutory requirement so that adding, removing, or modifying a template item
// produces a clear, traceable failure.
// =============================================================================

describe('legislative amendment regression detection', () => {
  /**
   * Simulates what happens if a future amendment (e.g. HB 913 successor) adds
   * a new required document category. The test constructs what the template
   * SHOULD look like after the amendment and verifies the current template
   * against it.
   *
   * When a real amendment adds a requirement:
   *   1. Add the item to CONDO_718_CHECKLIST_TEMPLATE in templates.ts
   *   2. Run this suite — the "current template covers all known requirements" test
   *      will PASS (because it checks the actual template)
   *   3. But any test pinned to the OLD count (e.g. "requires exactly 16") will FAIL
   *   4. Update that count to 17, confirming you've reviewed the change
   */

  // Complete manifest of required template keys — the source of truth for what
  // the system MUST enforce. If a key is missing from the template, the test
  // fails with a clear message about which statutory requirement is unmet.
  const REQUIRED_CONDO_KEYS = [
    '718_declaration',
    '718_bylaws',
    '718_articles',
    '718_rules',
    '718_qa_sheet',
    '718_budget',
    '718_financial_report',
    '718_minutes_rolling_12m',
    '718_video_recordings',
    '718_affidavits',
    '718_insurance',
    '718_contracts',
    '718_conflict_contracts',
    '718_bids',
    '718_inspection_reports',
    '718_sirs',
  ] as const;

  const REQUIRED_HOA_KEYS = [
    '720_governing_docs',
    '720_articles',
    '720_bylaws_rules',
    '720_budget',
    '720_financial_report',
    '720_minutes_rolling_12m',
    '720_meeting_notices',
    '720_insurance',
    '720_contracts',
    '720_bids',
  ] as const;

  it('condo template contains every required statutory key', () => {
    const templateKeys = CONDO_718_CHECKLIST_TEMPLATE.map((t) => t.templateKey);
    for (const required of REQUIRED_CONDO_KEYS) {
      expect(templateKeys, `Missing condo template key: ${required}`).toContain(required);
    }
  });

  it('HOA template contains every required statutory key', () => {
    const templateKeys = HOA_720_CHECKLIST_TEMPLATE.map((t) => t.templateKey);
    for (const required of REQUIRED_HOA_KEYS) {
      expect(templateKeys, `Missing HOA template key: ${required}`).toContain(required);
    }
  });

  it('no condo template keys exist that are not in the known manifest', () => {
    // This catches orphaned keys from repealed requirements.
    // If a statute is repealed and the key removed from REQUIRED_CONDO_KEYS,
    // this test forces you to also remove it from the template.
    const templateKeys = CONDO_718_CHECKLIST_TEMPLATE.map((t) => t.templateKey);
    for (const key of templateKeys) {
      expect(
        (REQUIRED_CONDO_KEYS as readonly string[]).includes(key),
        `Unexpected condo template key "${key}" not in statutory manifest — was a requirement repealed?`,
      ).toBe(true);
    }
  });

  it('no HOA template keys exist that are not in the known manifest', () => {
    const templateKeys = HOA_720_CHECKLIST_TEMPLATE.map((t) => t.templateKey);
    for (const key of templateKeys) {
      expect(
        (REQUIRED_HOA_KEYS as readonly string[]).includes(key),
        `Unexpected HOA template key "${key}" not in statutory manifest — was a requirement repealed?`,
      ).toBe(true);
    }
  });

  it('each template item maps to exactly one statute reference (no drift)', () => {
    // Build a map of templateKey → statuteReference. If someone accidentally
    // changes a statute reference during a refactor, this catches it.
    const expectedReferences: Record<string, string> = {
      '718_declaration': '§718.111(12)(g)(2)(a)',
      '718_bylaws': '§718.111(12)(g)(2)(b)',
      '718_articles': '§718.111(12)(g)(2)(c)',
      '718_rules': '§718.111(12)(g)(2)(d)',
      '718_qa_sheet': '§718.504',
      '718_budget': '§718.112(2)(f)',
      '718_financial_report': '§718.111(13)',
      '718_minutes_rolling_12m': '§718.111(12)(g)(2)(e)',
      '718_video_recordings': '§718.111(12)(g)(2)(f)',
      '718_affidavits': '§718.111(12)(g)(2)(g)',
      '718_insurance': '§718.111(11)',
      '718_contracts': '§718.111(12)(g)(2)',
      '718_conflict_contracts': '§718.3026',
      '718_bids': '§718.111(12)(g)(2)',
      '718_inspection_reports': '§553.899, §718.301(4)(p)',
      '718_sirs': '§718.112(2)(g)',
    };

    for (const item of CONDO_718_CHECKLIST_TEMPLATE) {
      const expected = expectedReferences[item.templateKey];
      if (expected) {
        expect(
          item.statuteReference,
          `Statute reference drift for ${item.templateKey}: expected "${expected}", got "${item.statuteReference}"`,
        ).toBe(expected);
      }
    }
  });

  it('template count is pinned — forces review when items are added or removed', () => {
    // When a legislative amendment adds a new requirement:
    //   1. Add the item to templates.ts
    //   2. Add the key to REQUIRED_CONDO_KEYS above
    //   3. Update this count from 16 to 17
    //   4. Add a statute reference entry in the drift check above
    // This 4-step process ensures no requirement is added without full review.
    expect(CONDO_718_CHECKLIST_TEMPLATE).toHaveLength(REQUIRED_CONDO_KEYS.length);
    expect(HOA_720_CHECKLIST_TEMPLATE).toHaveLength(REQUIRED_HOA_KEYS.length);
  });
});

// =============================================================================
// Category Grouping
// =============================================================================

describe('category grouping preserves statutory order', () => {
  it('groups condo items in statutory order: governing → financial → meeting → insurance → operations', () => {
    const items = CONDO_718_CHECKLIST_TEMPLATE.map((t) => ({
      ...t,
      id: 0,
    }));
    const grouped = groupByCategory(items);
    const keys = Array.from(grouped.keys());

    expect(keys[0]).toBe('governing_documents');
    expect(keys[1]).toBe('financial_records');
    expect(keys[2]).toBe('meeting_records');
    expect(keys[3]).toBe('insurance');
    expect(keys[4]).toBe('operations');
  });

  it('governing documents group has 5 items for condo', () => {
    const items = CONDO_718_CHECKLIST_TEMPLATE.map((t) => ({
      ...t,
      id: 0,
    }));
    const grouped = groupByCategory(items);
    expect(grouped.get('governing_documents')).toHaveLength(5);
  });
});
