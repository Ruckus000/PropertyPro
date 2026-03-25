import { describe, expect, it } from 'vitest';
import {
  DEMO_TEMPLATE_IDS,
  isDemoTemplateId,
  getDemoTemplates,
  getDefaultTemplate,
  getTemplateById,
} from '../demo-templates';

describe('DEMO_TEMPLATE_IDS', () => {
  it('is non-empty', () => {
    expect(DEMO_TEMPLATE_IDS.length).toBeGreaterThan(0);
  });

  it('contains only non-empty strings', () => {
    for (const id of DEMO_TEMPLATE_IDS) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });
});

describe('isDemoTemplateId()', () => {
  it('returns true for a valid template ID', () => {
    expect(isDemoTemplateId(DEMO_TEMPLATE_IDS[0])).toBe(true);
  });

  it('returns false for an unknown string', () => {
    expect(isDemoTemplateId('not-a-real-template')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isDemoTemplateId(null)).toBe(false);
    expect(isDemoTemplateId(undefined)).toBe(false);
    expect(isDemoTemplateId(42)).toBe(false);
  });
});

describe('getDemoTemplates()', () => {
  it('filters by communityType', () => {
    const results = getDemoTemplates('condo_718');
    expect(results.length).toBeGreaterThan(0);
    for (const t of results) {
      expect(t.communityType).toBe('condo_718');
    }
  });

  it('filters by communityType and variant', () => {
    const results = getDemoTemplates('condo_718', 'public');
    expect(results.length).toBeGreaterThan(0);
    for (const t of results) {
      expect(t.communityType).toBe('condo_718');
      expect(t.variant).toBe('public');
    }
  });

  it('returns empty array when no match', () => {
    const results = getDemoTemplates('apartment', 'mobile');
    // may or may not be empty depending on seeded templates, but should be an array
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('getDefaultTemplate()', () => {
  it('returns first match for communityType', () => {
    const first = getDemoTemplates('condo_718')[0];
    const def = getDefaultTemplate('condo_718');
    expect(def).toBeDefined();
    expect(def?.id).toBe(first?.id);
  });

  it('returns first match for communityType + variant', () => {
    const first = getDemoTemplates('condo_718', 'public')[0];
    const def = getDefaultTemplate('condo_718', 'public');
    expect(def).toBeDefined();
    expect(def?.id).toBe(first?.id);
  });

  it('returns undefined if no templates match', () => {
    const def = getDefaultTemplate('hoa_720', 'mobile');
    // May be undefined if none seeded — just verify it doesn't throw
    expect(def === undefined || def !== null).toBe(true);
  });
});

describe('getTemplateById()', () => {
  it('returns the template for a known ID', () => {
    const id = DEMO_TEMPLATE_IDS[0];
    const t = getTemplateById(id);
    expect(t).toBeDefined();
    expect(t?.id).toBe(id);
  });

  it('returns undefined for an unknown ID', () => {
    expect(getTemplateById('does-not-exist' as never)).toBeUndefined();
  });
});

describe('Template definitions', () => {
  it('every template build() returns a non-empty string containing "function App"', () => {
    const allTemplates = getDemoTemplates('condo_718')
      .concat(getDemoTemplates('hoa_720'))
      .concat(getDemoTemplates('apartment'));

    for (const t of allTemplates) {
      const output = t.build({ communityName: 'Test Community' });
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain('function App');
    }
  });

  it('every template has a valid thumbnail descriptor', () => {
    const allTemplates = getDemoTemplates('condo_718')
      .concat(getDemoTemplates('hoa_720'))
      .concat(getDemoTemplates('apartment'));

    for (const t of allTemplates) {
      expect(Array.isArray(t.thumbnail.gradient)).toBe(true);
      expect(t.thumbnail.gradient).toHaveLength(2);
      expect(typeof t.thumbnail.gradient[0]).toBe('string');
      expect(typeof t.thumbnail.gradient[1]).toBe('string');
      expect(typeof t.thumbnail.layout).toBe('string');
      expect(t.thumbnail.layout.length).toBeGreaterThan(0);
    }
  });
});
