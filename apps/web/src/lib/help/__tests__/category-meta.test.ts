import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getHelpCategoryMeta,
  HELP_CATEGORY_META,
  HELP_CATEGORY_ORDER,
} from '@/lib/help/category-meta';

describe('getHelpCategoryMeta', () => {
  it('has an explicit, ordered entry for every content category directory in every section', () => {
    const contentRoot = join(__dirname, '..', '..', '..', 'content', 'help');
    const sections = readdirSync(contentRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const section of sections) {
      const dirs = readdirSync(join(contentRoot, section.name), { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      for (const dir of dirs) {
        expect(HELP_CATEGORY_META[dir], `missing category-meta entry for "${section.name}/${dir}"`).toBeDefined();
        expect(HELP_CATEGORY_ORDER, `"${dir}" has no place in HELP_CATEGORY_ORDER`).toContain(dir);
      }
    }
  });

  it('orders exactly the categories it describes', () => {
    expect([...HELP_CATEGORY_ORDER].sort()).toEqual(Object.keys(HELP_CATEGORY_META).sort());
  });

  it('falls back to a generic entry for unknown categories', () => {
    const meta = getHelpCategoryMeta('not-a-category');
    expect(meta.label).toBe('Not a category');
    expect(meta.icon).toBeDefined();
    expect(meta.chipClass).toContain('bg-surface-muted');
  });
});
