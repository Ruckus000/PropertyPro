import { describe, expect, it } from 'vitest';
import { getComplianceTemplate, getDefaultDocumentCategories } from '@propertypro/shared';
import { getTemplateDocumentCategory } from '@/components/compliance/compliance-visibility';
import {
  buildStarterSet,
  buildStatutorySteps,
  statutoryProgress,
  statutoryStepFor,
  type SetupChecklistItem,
} from '@/lib/documents/setup-model';

const categoryFor = (item: SetupChecklistItem) => getTemplateDocumentCategory(item.templateKey, item.category);

/** The rows a new community gets, straight from the statutory template. */
function rowsFor(type: 'condo_718' | 'hoa_720'): SetupChecklistItem[] {
  return getComplianceTemplate(type).map((t, index) => ({
    id: index + 1,
    templateKey: t.templateKey,
    title: t.title,
    category: t.category,
    documentId: null,
    documentState: null,
    isConditional: t.isConditional ?? false,
    isApplicable: true,
  }));
}

const post = (rows: SetupChecklistItem[], key: string, state: 'posted' | 'draft' | 'deleted' = 'posted') =>
  rows.map((r) => (r.templateKey === key ? { ...r, documentId: 900 + r.id, documentState: state } : r));

describe('statutory steps: condo', () => {
  const steps = buildStatutorySteps(rowsFor('condo_718'), categoryFor);

  it('groups the 21 records into the five steps, in order', () => {
    expect(steps.map((s) => s.key)).toEqual(['governing', 'money', 'meetings', 'board', 'building']);
    expect(steps.map((s) => s.items.length)).toEqual([5, 3, 3, 7, 3]);
  });

  it('counts 13 required and 8 "if it applies" on day one', () => {
    expect(statutoryProgress(steps)).toMatchObject({ posted: 0, required: 13, conditionalOpen: 8, complete: false });
    expect(steps.map((s) => s.required)).toEqual([5, 2, 2, 4, 0]);
  });

  it('files board records that are stored under meeting_records in the board step', () => {
    expect(statutoryStepFor({ templateKey: '718_affidavits', category: 'meeting_records' }, 'x')).toBe('board');
    expect(statutoryStepFor({ templateKey: '718_director_certifications', category: 'meeting_records' }, 'x')).toBe('board');
  });

  it('a step of only "if it applies" records is done once each is posted or set aside', () => {
    const building = () => buildStatutorySteps(rows, categoryFor).find((s) => s.key === 'building');
    let rows = rowsFor('condo_718');
    expect(building()?.done).toBe(false);
    rows = post(rows, '718_sirs');
    rows = rows.map((r) =>
      r.templateKey === '718_inspection_reports' || r.templateKey === '718_building_permits' ? { ...r, isApplicable: false } : r,
    );
    expect(building()?.done).toBe(true);
  });
});

describe('statutory progress', () => {
  it('counts only POSTED files: a draft or deleted file is not posted', () => {
    let rows = rowsFor('condo_718');
    rows = post(rows, '718_declaration');
    rows = post(rows, '718_bylaws', 'draft');
    rows = post(rows, '718_articles', 'deleted');
    const progress = statutoryProgress(buildStatutorySteps(rows, categoryFor));
    expect(progress.posted).toBe(1);
    expect(progress.next?.templateKey).toBe('718_bylaws');
  });

  it('a record marked "doesn\'t apply" leaves the count', () => {
    const rows = rowsFor('condo_718').map((r) =>
      r.templateKey === '718_video_recordings' || r.templateKey === '718_budget' ? { ...r, isApplicable: false } : r,
    );
    expect(statutoryProgress(buildStatutorySteps(rows, categoryFor))).toMatchObject({ required: 12, conditionalOpen: 7 });
  });

  it('is complete when every applicable required record is posted', () => {
    let rows = rowsFor('hoa_720');
    for (const r of rows.filter((x) => !x.isConditional)) rows = post(rows, r.templateKey);
    const progress = statutoryProgress(buildStatutorySteps(rows, categoryFor));
    expect(progress).toMatchObject({ posted: 11, required: 11, complete: true, next: null });
  });
});

describe('statutory steps: HOA', () => {
  it('has four steps (no building reports) with 11 required and 3 conditional', () => {
    const steps = buildStatutorySteps(rowsFor('hoa_720'), categoryFor);
    expect(steps.map((s) => s.key)).toEqual(['governing', 'money', 'meetings', 'board']);
    expect(statutoryProgress(steps)).toMatchObject({ required: 11, conditionalOpen: 3 });
  });
});

describe('apartment starter set', () => {
  it('splits the default categories by what a tenant may open, per the access policy', () => {
    const categories = getDefaultDocumentCategories('apartment').map((c, i) => ({ id: i + 1, name: c.name }));
    const { residentFacing, staffOnly } = buildStarterSet(categories, 'apartment');
    expect(residentFacing.map((c) => c.name).sort()).toEqual(
      ['Community Handbook', 'Lease Agreements', 'Move In/Out Docs', 'Rules'].sort(),
    );
    expect(staffOnly.map((c) => c.name).sort()).toEqual(['Communications', 'Compliance', 'Financials', 'Maintenance Records'].sort());
  });
});
