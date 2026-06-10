import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getHelpCategoryMeta, HELP_CATEGORY_META } from '@/lib/help/category-meta';

describe('getHelpCategoryMeta', () => {
  it('has an explicit entry for every content category directory', () => {
    const contentRoot = join(__dirname, '..', '..', '..', 'content', 'help');
    const dirs = readdirSync(contentRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const dir of dirs) {
      expect(HELP_CATEGORY_META[dir], `missing category-meta entry for "${dir}"`).toBeDefined();
    }
  });

  it('falls back to a generic entry for unknown categories', () => {
    const meta = getHelpCategoryMeta('not-a-category');
    expect(meta.label).toBe('Not a category');
    expect(meta.icon).toBeDefined();
    expect(meta.chipClass).toContain('bg-surface-muted');
  });
});
