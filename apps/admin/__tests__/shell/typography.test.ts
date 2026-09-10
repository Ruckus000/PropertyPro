import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

// Extracts just the `const fraunces = localFont({ ... });` call out of the
// layout source, so the two assertions below can't be satisfied (or broken)
// by unrelated text elsewhere in the file — e.g. the `inter` declaration, or
// prose in a comment that happens to contain the word "italic".
const readFrauncesDeclaration = () => {
  const layout = read('src/app/layout.tsx');
  const match = layout.match(/const fraunces = localFont\(\{[\s\S]*?\}\);/);
  expect(match, 'expected a `const fraunces = localFont({ ... });` declaration in layout.tsx').not.toBeNull();
  return match![0];
};

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
  it('does not load an italic Fraunces face', () => {
    // font-display is only ever used for page-title h1s at weight 500,
    // roman — the italic woff2 would be ~81KB of dead weight. Scoped to the
    // Fraunces `src` declaration (not the whole file, and not a bare
    // `/italic/` match) so this fails specifically when an italic FONT FILE
    // is referenced, not when the word "italic" appears in a comment above
    // the declaration explaining why there isn't one.
    const fraunces = readFrauncesDeclaration();
    expect(fraunces).not.toMatch(/-italic\.woff2/);
  });
  it('sets adjustFontFallback to Times New Roman for Fraunces', () => {
    // next/font/local defaults its fallback metrics to Arial. Measuring a
    // serif display face against a sans-serif fallback makes cumulative
    // layout shift worse, not better, so this must stay pinned to a serif
    // fallback.
    const fraunces = readFrauncesDeclaration();
    expect(fraunces).toMatch(/adjustFontFallback:\s*'Times New Roman'/);
  });
});
