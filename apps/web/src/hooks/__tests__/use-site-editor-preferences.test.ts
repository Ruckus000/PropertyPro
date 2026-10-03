import { describe, expect, it } from 'vitest';
import { applyPreferencesChange } from '../use-site-editor-preferences';

const base = { mode: null, tourDone: false, marked: [], visited: [] } as const;

describe('applyPreferencesChange (the optimistic guess)', () => {
  it('sets the mode and the tour flag', () => {
    expect(applyPreferencesChange({ ...base, marked: [], visited: [] }, { mode: 'guided', tourDone: true })).toMatchObject({
      mode: 'guided',
      tourDone: true,
    });
  });

  it('marks and unmarks without duplicates', () => {
    const marked = applyPreferencesChange({ ...base, marked: ['welcome'], visited: [] }, { mark: 'welcome' });
    expect(marked.marked).toEqual(['welcome']);
    expect(applyPreferencesChange(marked, { unmark: 'welcome' }).marked).toEqual([]);
  });

  it('records a visit once and keeps the others', () => {
    const next = applyPreferencesChange({ ...base, marked: [], visited: ['pages'] }, { visit: 'design' });
    expect(next.visited).toEqual(['pages', 'design']);
    expect(applyPreferencesChange(next, { visit: 'design' }).visited).toEqual(['pages', 'design']);
  });

  it('leaves what the change does not mention', () => {
    const current = { mode: 'free' as const, tourDone: true, marked: ['photo' as const], visited: ['phone' as const] };
    expect(applyPreferencesChange(current, { visit: 'pages' })).toEqual({ ...current, visited: ['phone', 'pages'] });
  });
});
