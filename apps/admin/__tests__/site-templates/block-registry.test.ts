import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES, textBlockSchema, heroBlockSchema } from '@propertypro/shared';
import {
  describeBlockFields,
  getBlockRegistry,
} from '../../src/lib/site-templates/block-registry';

describe('describeBlockFields', () => {
  it('introspects a plain object schema (text): required body, optional heading', () => {
    const fields = describeBlockFields(textBlockSchema);
    expect(fields).toEqual(
      expect.arrayContaining([
        { name: 'heading', type: 'string', optional: true, nullable: false },
        { name: 'body', type: 'string', optional: false, nullable: false },
      ]),
    );
    expect(fields).toHaveLength(2);
  });

  it('reads .shape through .strict().refine() wrappers (hero)', () => {
    const fields = describeBlockFields(heroBlockSchema);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.headline).toEqual({ name: 'headline', type: 'string', optional: false, nullable: false });
    expect(byName.subtitle.optional).toBe(true);
    expect(byName.heroImagePath).toMatchObject({ type: 'string', optional: true });
    expect(byName.heroImageAlt.optional).toBe(true);
  });

  it('returns [] for a non-object schema input', () => {
    expect(describeBlockFields(undefined)).toEqual([]);
    expect(describeBlockFields({})).toEqual([]);
  });
});

describe('getBlockRegistry', () => {
  const entries = getBlockRegistry();

  it('covers every BLOCK_TYPE exactly once', () => {
    expect(entries.map((e) => e.type).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it('populates renderer path, docs link, tier, and fields for each entry', () => {
    for (const entry of entries) {
      expect(entry.rendererPath).toMatch(/^apps\/web\/src\/components\/public-site\/blocks\/.+\.tsx$/);
      expect(entry.docHref).toContain(entry.type);
      expect(['essentials', 'professional']).toContain(entry.tier);
      expect(entry.fields.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });
});
