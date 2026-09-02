import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { BLOCK_TYPES, textBlockSchema, heroBlockSchema } from '@propertypro/shared';
import {
  describeBlockFields,
  getBlockRegistry,
} from '../../src/lib/site-templates/block-registry';

describe('describeBlockFields', () => {
  it('introspects a plain object schema (text): required body; optional heading, variant and hidden', () => {
    const fields = describeBlockFields(textBlockSchema);
    expect(fields).toEqual(
      expect.arrayContaining([
        { name: 'heading', type: 'string', optional: true, nullable: false },
        { name: 'body', type: 'string', optional: false, nullable: false },
        // Phase 9 layout variant — an enum, so it also covers the enum tag.
        { name: 'variant', type: 'enum', optional: true, nullable: false },
        // Site-editor "hide from visitors" flag — z.literal(true).optional(), so
        // absence is the only representation of visible. Editor-managed, but it
        // IS part of the content schema, and this view documents the schema.
        { name: 'hidden', type: 'literal', optional: true, nullable: false },
      ]),
    );
    expect(fields).toHaveLength(4);
  });

  it('reads .shape through .strict().refine() wrappers (hero)', () => {
    const fields = describeBlockFields(heroBlockSchema);
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
    expect(byName.headline).toEqual({ name: 'headline', type: 'string', optional: false, nullable: false });
    expect(byName.subtitle!.optional).toBe(true);
    expect(byName.heroImagePath).toMatchObject({ type: 'string', optional: true });
    expect(byName.heroImageAlt!.optional).toBe(true);
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

  it('every docHref points at a file that exists on disk', () => {
    // Repo root is four levels up from apps/admin/__tests__/site-templates/.
    const repoRoot = resolve(__dirname, '../../../..');
    for (const entry of entries) {
      const target = resolve(repoRoot, entry.docHref);
      expect(existsSync(target), `${entry.type}: ${entry.docHref} does not exist`).toBe(true);
    }
  });
});
