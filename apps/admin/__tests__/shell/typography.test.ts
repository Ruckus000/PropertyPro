import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

describe('admin typography foundation', () => {
  it('loads Fraunces as --font-display next to Inter', () => {
    const layout = read('src/app/layout.tsx');
    expect(layout).toMatch(/fraunces-latin-var\.woff2/);
    expect(layout).toMatch(/variable: '--font-display'/);
    expect(layout).toMatch(/\$\{inter\.variable\} \$\{fraunces\.variable\}/);
  });
  it('sets the 18px root like apps/web', () => {
    expect(read('src/styles/globals.css')).toMatch(/:root\s*\{[^}]*font-size:\s*18px/);
  });
  it('exposes font-display in tailwind', () => {
    expect(read('tailwind.config.ts')).toMatch(/display: \['var\(--font-display\)', 'Fraunces'/);
  });
});
