import { describe, it, expect } from 'vitest';
import { COMMUNITY_TYPES } from '../index';
import {
  countLiveSections,
  recommendedSectionTypes,
  requirementLevel,
  unitCountUnknown,
  unitThreshold,
  isRequiredSectionType,
  requiredSectionIssues,
  requiredRemovalRefusal,
  requiredSectionLaw,
  requiredSectionStatus,
  requiredSectionTypes,
} from './required';
import type { RequiredSectionPage } from './required';
import type { SiteSectionSnapshot } from './types';

/** A subject with an UNKNOWN count unless given — which the rules treat as covered. */
const s = (communityType: string, unitCount: number | null = null) => ({ communityType, unitCount });

const section = (slot: number, blockType: string, content: object = {}): SiteSectionSnapshot => ({
  slot,
  blockType,
  content,
});

const page = (
  pageId: string,
  sections: SiteSectionSnapshot[],
  tombstonedSlots: number[] = [],
): RequiredSectionPage => ({ pageId, snapshot: { hero: null, sections, tombstonedSlots } });

describe('requiredSectionTypes', () => {
  it('requires documents and meetings for condos and HOAs', () => {
    expect(requiredSectionTypes(s('condo_718'))).toEqual(['documents', 'meetings']);
    expect(requiredSectionTypes(s('hoa_720'))).toEqual(['documents', 'meetings']);
  });

  it('requires nothing for apartments', () => {
    expect(requiredSectionTypes(s('apartment'))).toEqual([]);
  });

  it('fails open on a community type it does not know', () => {
    expect(requiredSectionTypes(s('co_op'))).toEqual([]);
    expect(isRequiredSectionType(s('co_op'), 'documents')).toBe(false);
  });

  it('has an answer for every community type the app knows', () => {
    // A new community type must be a deliberate decision here, not a silent [].
    for (const type of COMMUNITY_TYPES) {
      expect(Array.isArray(requiredSectionTypes(s(type)))).toBe(true);
    }
    expect(COMMUNITY_TYPES).toEqual(['condo_718', 'hoa_720', 'apartment']);
  });

  it('never marks the hero or an optional section as required', () => {
    expect(isRequiredSectionType(s('condo_718'), 'hero')).toBe(false);
    expect(isRequiredSectionType(s('condo_718'), 'faq')).toBe(false);
    expect(isRequiredSectionType(s('condo_718'), 'meetings')).toBe(true);
  });
});

describe('requiredSectionStatus', () => {
  it('is visible when any page shows one, even if another copy is hidden', () => {
    const pages = [
      page('1', [section(2, 'documents', { hidden: true })]),
      page('2', [section(3, 'documents'), section(4, 'meetings')]),
    ];
    expect(requiredSectionStatus(s('condo_718'), pages).map((s) => s.state)).toEqual(['visible', 'visible']);
  });

  it('points a hidden requirement at its first copy in page order', () => {
    const pages = [
      page('1', [section(5, 'meetings', { hidden: true }), section(3, 'meetings', { hidden: true })]),
      page('2', [section(2, 'meetings', { hidden: true })]),
    ];
    const meetings = requiredSectionStatus(s('condo_718'), pages)[1]!;
    expect(meetings.state).toBe('hidden');
    expect(meetings.hiddenAt).toEqual({ pageId: '1', slot: 3 });
  });

  it('treats a section staged for removal as already gone', () => {
    const pages = [page('1', [section(2, 'documents'), section(3, 'meetings')], [2])];
    expect(requiredSectionStatus(s('condo_718'), pages)[0]!.state).toBe('missing');
    expect(countLiveSections(pages, 'documents')).toBe(0);
    expect(countLiveSections(pages, 'meetings')).toBe(1);
  });

  it('is empty for a community with no requirements', () => {
    expect(requiredSectionStatus(s('apartment'), [page('1', [])])).toEqual([]);
  });
});

describe('requiredSectionIssues', () => {
  it('says nothing when every required section is visible', () => {
    const pages = [page('1', [section(2, 'documents'), section(3, 'meetings')])];
    expect(requiredSectionIssues(s('condo_718'), pages)).toEqual([]);
  });

  it('warns — never errors — about a missing section', () => {
    const issues = requiredSectionIssues(s('hoa_720'), [page('1', [section(2, 'meetings')])]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'required.documents', severity: 'warning', blockType: 'documents' });
    expect(issues[0]!.message).toContain('No page has a Documents section');
    expect(issues[0]!.message).toContain('§720.303');
    expect(issues[0]!.slot).toBeUndefined();
  });

  it('targets a hidden section so the sheet can offer to show it', () => {
    const issues = requiredSectionIssues(s('condo_718'), [
      page('7', [section(2, 'documents'), section(4, 'meetings', { hidden: true })]),
    ]);
    expect(issues).toEqual([
      expect.objectContaining({ severity: 'warning', blockType: 'meetings', slot: 4, pageId: '7' }),
    ]);
    expect(issues[0]!.message).toContain('§718.111(12)(g)');
  });

  it('never states a fine amount', () => {
    const issues = requiredSectionIssues(s('condo_718'), [page('1', [])]);
    expect(issues).toHaveLength(2);
    for (const issue of issues) expect(issue.message).not.toMatch(/\$|per day|fine/i);
  });

  it('says nothing for an apartment site with neither section', () => {
    expect(requiredSectionIssues(s('apartment'), [page('1', [])])).toEqual([]);
  });
});

describe('requiredSectionLaw', () => {
  it('names the statute and what it asks for', () => {
    expect(requiredSectionLaw('condo_718', 'meetings')).toBe(
      'Florida law (§718.111(12)(g)) asks associations to post meeting notices on their website.',
    );
    expect(requiredSectionLaw('hoa_720', 'documents')).toContain('§720.303');
  });

  it('is null for a section or community with no requirement', () => {
    expect(requiredSectionLaw('condo_718', 'faq')).toBeNull();
    expect(requiredSectionLaw('apartment', 'meetings')).toBeNull();
  });
});

describe('requiredRemovalRefusal', () => {
  const both = [page('1', [section(2, 'documents')]), page('2', [section(3, 'meetings')])];

  it('refuses removing the only copy, saying what to do instead', () => {
    const refusal = requiredRemovalRefusal(s('condo_718'), both, { kind: 'section', pageId: '2', slot: 3 });
    expect(refusal).toMatch(/^This is your only Meetings section\./);
    expect(refusal).toMatch(/hide it or move it instead/);
  });

  it('allows removing one of two copies — a hidden one counts', () => {
    const pages = [...both, page('3', [section(4, 'meetings', { hidden: true })])];
    expect(requiredRemovalRefusal(s('condo_718'), pages, { kind: 'section', pageId: '2', slot: 3 })).toBeNull();
  });

  it('matches the slot on the named page only', () => {
    // Page 1 slot 3 is text; removing it must not be mistaken for page 2's slot 3.
    const pages = [page('1', [section(2, 'documents'), section(3, 'text')]), page('2', [section(3, 'meetings')])];
    expect(requiredRemovalRefusal(s('condo_718'), pages, { kind: 'section', pageId: '1', slot: 3 })).toBeNull();
  });

  it('names every section a page removal would lose', () => {
    const pages = [page('1', []), page('2', [section(2, 'documents'), section(3, 'meetings')])];
    const refusal = requiredRemovalRefusal(s('hoa_720'), pages, { kind: 'page', pageId: '2' });
    expect(refusal).toMatch(/^This page has your only Documents section and Meetings section\./);
    expect(refusal).toMatch(/§720\.303/);
    expect(refusal).toMatch(/another page/);
  });

  it('allows removing an optional section while a required one is already missing', () => {
    const pages = [page('1', [section(2, 'faq')])];
    expect(requiredRemovalRefusal(s('condo_718'), pages, { kind: 'section', pageId: '1', slot: 2 })).toBeNull();
  });

  it('never refuses on an apartment site', () => {
    expect(requiredRemovalRefusal(s('apartment'), both, { kind: 'page', pageId: '2' })).toBeNull();
  });
});

describe('requirementLevel — the statutes only reach associations above a size', () => {
  it('requires a condo of 25+ units and recommends below', () => {
    expect(requirementLevel(s('condo_718', 25))).toBe('required');
    expect(requirementLevel(s('condo_718', 24))).toBe('recommended');
  });

  it('requires an HOA of 100+ parcels and recommends below', () => {
    expect(requirementLevel(s('hoa_720', 100))).toBe('required');
    expect(requirementLevel(s('hoa_720', 99))).toBe('recommended');
  });

  it('treats an UNKNOWN count as covered, and says it is unknown', () => {
    expect(requirementLevel(s('condo_718', null))).toBe('required');
    expect(unitCountUnknown(s('condo_718', null))).toBe(true);
    expect(unitCountUnknown(s('condo_718', 40))).toBe(false);
  });

  it('has nothing to say about apartments, whatever the count', () => {
    expect(requirementLevel(s('apartment', 500))).toBe('none');
    expect(unitCountUnknown(s('apartment', null))).toBe(false);
    expect(unitThreshold('apartment')).toBeNull();
  });

  it('names the threshold for copy', () => {
    expect(unitThreshold('condo_718')).toEqual({ minUnits: 25, unitNoun: 'units' });
    expect(unitThreshold('hoa_720')).toEqual({ minUnits: 100, unitNoun: 'parcels' });
  });
});

describe('below the threshold, the sections are recommended — never locked or warned about', () => {
  const small = s('condo_718', 12);
  const pages = [page('1', [section(2, 'meetings')])];

  it('lists them as recommended, not required', () => {
    expect(requiredSectionTypes(small)).toEqual([]);
    expect(recommendedSectionTypes(small)).toEqual(['documents', 'meetings']);
    expect(isRequiredSectionType(small, 'meetings')).toBe(false);
  });

  it('raises no publish warning and refuses no removal', () => {
    expect(requiredSectionStatus(small, pages)).toEqual([]);
    expect(requiredSectionIssues(small, pages)).toEqual([]);
    expect(requiredRemovalRefusal(small, pages, { kind: 'section', pageId: '1', slot: 2 })).toBeNull();
  });

  it('recommends nothing once the statute applies', () => {
    expect(recommendedSectionTypes(s('condo_718', 30))).toEqual([]);
    expect(recommendedSectionTypes(s('condo_718', null))).toEqual([]);
  });
});
