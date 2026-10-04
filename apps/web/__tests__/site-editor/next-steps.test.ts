import { describe, expect, it } from 'vitest';
import { buildNextSteps, type NextStepsInput } from '../../src/lib/site-editor/next-steps';
import type { RecordsGroup } from '../../src/lib/site-editor/records-status';

const LAW = 'Florida law (§718.111(12)(g)) asks associations to post official records on their website.';

function group(category: string, label: string, status: RecordsGroup['status']): RecordsGroup {
  return { category, label, status, satisfied: 0, total: 1, draftDocumentId: null } as RecordsGroup;
}

function input(over: Partial<NextStepsInput> = {}): NextStepsInput {
  return {
    level: 'required',
    sections: [
      { blockType: 'documents', title: 'Documents section', state: 'visible' },
      { blockType: 'meetings', title: 'Meetings section', state: 'visible' },
    ],
    lawFor: () => LAW,
    records: [group('financial_records', 'Financial records', 'up_to_date')],
    marked: [],
    visited: [],
    heroHasImage: false,
    everPublished: false,
    pendingChanges: 3,
    ...over,
  };
}

const keys = (r: ReturnType<typeof buildNextSteps>) => r.groups.map((g) => g.steps.map((s) => s.key));
const step = (r: ReturnType<typeof buildNextSteps>, key: string) =>
  r.groups.flatMap((g) => g.steps).find((s) => s.key === key)!;

describe('buildNextSteps', () => {
  it('puts Florida’s rules first, then the six setup steps in the design’s order', () => {
    const r = buildNextSteps(input());
    expect(r.groups.map((g) => g.title)).toEqual(['Required by Florida law', 'Make it yours']);
    expect(keys(r)).toEqual([
      ['section-documents', 'section-meetings', 'records'],
      ['welcome', 'photo', 'design', 'pages', 'phone', 'publish'],
    ]);
  });

  it('a missing required section offers Add, a hidden one offers Show, each with the law', () => {
    const r = buildNextSteps(
      input({
        sections: [
          { blockType: 'documents', title: 'Documents section', state: 'missing' },
          { blockType: 'meetings', title: 'Meetings section', state: 'hidden', hiddenAt: { pageId: 'p', slot: 2 } },
        ],
      }),
    );
    expect(step(r, 'section-documents')).toMatchObject({
      title: 'Official records need a section',
      done: false,
      cta: 'Add section',
      action: { kind: 'add-section', blockType: 'documents' },
      law: LAW,
      markable: false,
    });
    expect(step(r, 'section-meetings')).toMatchObject({
      title: 'Meeting notices are hidden',
      cta: 'Show section',
      action: { kind: 'show-section', blockType: 'meetings' },
    });
  });

  it('an empty records group names it and opens Documents', () => {
    const r = buildNextSteps(
      input({
        records: [
          group('financial_records', 'Financial records', 'nothing_posted'),
          group('insurance', 'Insurance', 'out_of_date'),
        ],
      }),
    );
    expect(step(r, 'records')).toMatchObject({
      title: 'A required document category is empty',
      detail: 'Nothing is posted yet for: Financial records.',
      action: { kind: 'open-documents' },
      done: false,
    });
  });

  it('never says $50 per day', () => {
    const r = buildNextSteps(
      input({ sections: [{ blockType: 'documents', title: 'Documents section', state: 'missing' }] }),
    );
    expect(JSON.stringify(r)).not.toMatch(/\$50|per day|fine/i);
  });

  it('below the size threshold the group is "recommended" and states no law', () => {
    const r = buildNextSteps(
      input({
        level: 'recommended',
        sections: [{ blockType: 'documents', title: 'Documents section', state: 'missing' }],
      }),
    );
    expect(r.groups[0]?.title).toBe('Recommended by Florida law');
    expect(step(r, 'section-documents').law).toBeNull();
  });

  it('apartments get no rules group', () => {
    const r = buildNextSteps(input({ level: 'none', sections: [], records: null }));
    expect(r.groups.map((g) => g.id)).toEqual(['setup']);
  });

  it('leaves the records item out while records are unknown, rather than claim they are empty', () => {
    const r = buildNextSteps(input({ records: null }));
    expect(keys(r)[0]).toEqual(['section-documents', 'section-meetings']);
  });

  it('setup steps: marked, visited, a hero photo, and a published site with nothing waiting', () => {
    const r = buildNextSteps(
      input({
        marked: ['welcome'],
        visited: ['design', 'phone'],
        heroHasImage: true,
        everPublished: true,
        pendingChanges: 0,
      }),
    );
    const done = r.groups[1]!.steps.filter((s) => s.done).map((s) => s.key);
    expect(done).toEqual(['welcome', 'photo', 'design', 'phone', 'publish']);
    expect(r.firstOpenKey).toBe('pages');
  });

  it('publish is not done while changes are waiting, or before the first publish', () => {
    expect(step(buildNextSteps(input({ everPublished: true, pendingChanges: 2 })), 'publish').done).toBe(false);
    expect(step(buildNextSteps(input({ everPublished: false, pendingChanges: 0 })), 'publish').done).toBe(false);
  });

  it('only welcome and photo can be ticked by hand, and only until done', () => {
    const r = buildNextSteps(input({ marked: ['photo'] }));
    const markable = r.groups.flatMap((g) => g.steps).filter((s) => s.markable).map((s) => s.key);
    expect(markable).toEqual(['welcome']);
  });

  it('counts progress across both groups and minutes for open setup steps', () => {
    const r = buildNextSteps(input({ visited: ['pages'] }));
    expect(r.total).toBe(9);
    expect(r.done).toBe(4); // three rules items + pages
    expect(r.minutesLeft).toBe(6); // 1 + 2 + 1 + 1 + 1
    expect(r.firstOpenKey).toBe('welcome');
  });

  it('a done step has no button', () => {
    const r = buildNextSteps(input({ visited: ['design'] }));
    expect(step(r, 'design')).toMatchObject({ done: true, cta: null, action: null });
  });

  it('never tells the manager to type on the page, which the canvas does not do', () => {
    const r = buildNextSteps(input());
    for (const s of r.groups.flatMap((g) => g.steps)) {
      expect(s.detail).not.toMatch(/on the page and type|click the headline/i);
    }
    expect(step(r, 'welcome').detail).toMatch(/settings on the right/);
  });
});
