import { describe, it, expect } from 'vitest';
import { statusLabel, statusVariant, VISIBILITY_LABEL, VISIBILITY_VARIANT } from '../compliance-pill-mapping';
import type { ChecklistItemData } from '../compliance-checklist-item';

function makeItem(overrides: Partial<ChecklistItemData> = {}): ChecklistItemData {
  return {
    id: 1, templateKey: '718_declaration', title: 'T',
    category: 'governing_documents', status: 'unsatisfied',
    documentId: null, documentPostedAt: null, deadline: null,
    rollingWindow: null, isApplicable: true,
    ...overrides,
  };
}

describe('statusLabel', () => {
  it('returns "Satisfied" for satisfied items', () => {
    expect(statusLabel(makeItem({ status: 'satisfied' }))).toBe('Satisfied');
  });
  it('returns "Overdue" for overdue items', () => {
    expect(statusLabel(makeItem({ status: 'overdue' }))).toBe('Overdue');
  });
  it('returns "Not applicable" for not_applicable items', () => {
    expect(statusLabel(makeItem({ status: 'not_applicable' }))).toBe('Not applicable');
  });
  it('returns "Needs board action" for board-action whitelist items that are unsatisfied', () => {
    expect(statusLabel(makeItem({ templateKey: '718_minutes_rolling_12m', status: 'unsatisfied' }))).toBe('Needs board action');
  });
  it('returns "Action needed" for non-whitelist unsatisfied items', () => {
    expect(statusLabel(makeItem({ status: 'unsatisfied' }))).toBe('Action needed');
  });
});

describe('statusVariant', () => {
  it('maps each status to its Badge variant', () => {
    expect(statusVariant('satisfied')).toBe('success');
    expect(statusVariant('overdue')).toBe('danger');
    expect(statusVariant('not_applicable')).toBe('neutral');
    expect(statusVariant('unsatisfied')).toBe('warning');
  });
});

describe('VISIBILITY_LABEL / VISIBILITY_VARIANT', () => {
  it('labels each visibility correctly', () => {
    expect(VISIBILITY_LABEL.public_page).toBe('Public');
    expect(VISIBILITY_LABEL.owner_portal).toBe('Owner portal');
    expect(VISIBILITY_LABEL.owner_only).toBe('Owner-only');
    expect(VISIBILITY_LABEL.board).toBe('Board');
  });
  it('maps each visibility to its Badge variant', () => {
    expect(VISIBILITY_VARIANT.public_page).toBe('info');
    expect(VISIBILITY_VARIANT.owner_portal).toBe('owner');
    expect(VISIBILITY_VARIANT.owner_only).toBe('owner');
    expect(VISIBILITY_VARIANT.board).toBe('board');
  });
});
