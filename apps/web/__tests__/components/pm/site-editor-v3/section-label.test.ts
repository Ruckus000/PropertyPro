/**
 * Section labels name a section in the section list, the float controls'
 * accessible names ("Remove Quick links section") and the reorder
 * announcements. A type with no label falls back to its raw id, which a
 * manager would hear read out as "quicklinks".
 */
import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES } from '@propertypro/shared';
import { sectionLabel } from '@/components/pm/site-editor-v3/section-label';

describe('sectionLabel', () => {
  it('names every block type in words, never by its raw id', () => {
    for (const type of BLOCK_TYPES) {
      expect(sectionLabel(type), `${type} has no label`).not.toBe(type);
    }
  });

  it('names the two new sections as the publish sheet does', () => {
    expect(sectionLabel('quicklinks')).toBe('Quick links');
    expect(sectionLabel('board')).toBe('Board members');
  });

  it('falls back to the raw type for one this build does not know', () => {
    expect(sectionLabel('mystery')).toBe('mystery');
  });
});
