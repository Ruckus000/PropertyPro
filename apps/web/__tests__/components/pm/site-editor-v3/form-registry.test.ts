/**
 * Inspector form registry — dispatch, and the two budget invariants that have
 * no runtime signal.
 *
 * The editor route runs against a 700 KiB hard budget that fails the build. A
 * static import in the registry, or a Radix stack pulled into a form by a
 * convenience import, renders perfectly and passes every behavioural test —
 * it shows up only as a bigger number in `pnpm perf:check`, usually several
 * commits after the change that caused it. Hence source reading.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { blockFormRegistry, hasForm } from '@/components/pm/site-editor-v3/inspector/form-registry';

// The root `pnpm test` runner and a direct `vitest` run inside apps/web have
// different working directories, so a single cwd-relative path passes in one
// and fails in the other. Resolve by trying both roots — same approach as
// `view-registry.test.ts`.
const INSPECTOR_DIR = [
  join(process.cwd(), 'src/components/pm/site-editor-v3/inspector'),
  join(process.cwd(), 'apps/web/src/components/pm/site-editor-v3/inspector'),
].find(existsSync)!;

function formFiles(): string[] {
  const dir = join(INSPECTOR_DIR, 'forms');
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) out.push(full);
    }
  };
  walk(dir);
  return out;
}

describe('form registry — dispatch', () => {
  it('reports coverage through hasForm rather than a hard-coded type list', () => {
    expect(hasForm('text')).toBe(true);
    expect(hasForm('hero')).toBe(false);
  });

  it('returns undefined for a type with no form, so the body can fall back', () => {
    // The registry is Partial by design — coverage is incremental, and a
    // section with no form must render an explanation rather than throw.
    // `contact` specifically has no empty-state to override (it renders
    // fields, not a list), so it is not merely unbuilt — it is excluded.
    expect(blockFormRegistry.contact).toBeUndefined();
  });

  it('does not report coverage for inherited Object properties', () => {
    // `hasForm` uses hasOwnProperty for a reason: a bare `in` or truthiness
    // check would answer true for 'constructor' / 'toString'.
    expect(hasForm('constructor')).toBe(false);
    expect(hasForm('toString')).toBe(false);
  });
});

describe('form registry — budget invariants', () => {
  it('imports every form through next/dynamic, never statically', () => {
    const source = readFileSync(join(INSPECTOR_DIR, 'form-registry.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // No static import from ./forms/…
    expect(code).not.toMatch(/^\s*import\s[^\n]*from\s+['"]\.\/forms\//m);

    // Every DISTINCT registry value comes from a dynamic() call. Distinct,
    // not per-key: one component legitimately serves several block types
    // (the SoR empty-text form covers three).
    const dynamicCalls = code.match(/dynamic\(/g) ?? [];
    const distinctComponents = new Set(Object.values(blockFormRegistry));
    expect(dynamicCalls.length).toBe(distinctComponents.size);
  });

  it('keeps Radix and react-image-crop out of every inspector form', () => {
    // Phase 2b-2's retrospective: the cost on this route was never the
    // components, it was the Radix dialog/portal stacks a convenience import
    // dragged in. `react-image-crop` is here because the v2 ImageBlockForm
    // uses it and it must not follow into v3 — cropping, if it ever arrives,
    // is its own chunk behind an explicit button.
    const banned = [
      '@radix-ui/',
      '@/components/ui/select',
      '@/components/ui/popover',
      '@/components/ui/command',
      'react-image-crop',
    ];
    for (const file of formFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const needle of banned) {
        expect(
          source.includes(needle),
          `${file} imports ${needle}, which belongs in a code-split chunk, not an inspector form`,
        ).toBe(false);
      }
    }
  });

  it('keeps node-only storage-paths out of every inspector form', () => {
    // `@/lib/site-assets/storage-paths` imports `node:crypto`. It typechecks,
    // it passes tests, and it fails at `next build`.
    for (const file of formFiles()) {
      expect(readFileSync(file, 'utf8')).not.toContain('site-assets/storage-paths');
    }
  });

  it('never lets a form key off block.id', () => {
    // Every write soft-deletes the row and INSERTs a fresh one, so `id`
    // changes on each save. A form keyed on it would remount — and lose the
    // PM's in-progress edit — on their first autosave.
    const body = readFileSync(join(INSPECTOR_DIR, 'InspectorBody.tsx'), 'utf8');
    const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bblockId\b/);
    expect(code).not.toMatch(/\bblock\.id\b/);
  });
});
