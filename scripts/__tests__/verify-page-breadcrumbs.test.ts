import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { verifyFile } from '../verify-page-breadcrumbs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../__fixtures__/breadcrumbs');

describe('verifyFile (page-title guard)', () => {
  it('passes a page with a <PageHeader title=...>', () => {
    const result = verifyFile(resolve(fixtures, 'passing-page.tsx'));
    expect(result.ok).toBe(true);
  });

  it('passes a page with a literal <h1>', () => {
    const result = verifyFile(resolve(fixtures, 'passing-h1-page.tsx'));
    expect(result.ok).toBe(true);
  });

  it('fails a page with no PageHeader title and no <h1>', () => {
    const result = verifyFile(resolve(fixtures, 'failing-page.tsx'));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no page title/i);
  });

  it('passes a delegated page when the target renders a page title', () => {
    const result = verifyFile(resolve(fixtures, 'delegated-page.tsx'));
    expect(result.ok).toBe(true);
  });

  it('fails a delegated page when the target renders no page title', () => {
    const result = verifyFile(resolve(fixtures, 'delegated-titleless-page.tsx'));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/renders no page-title/i);
  });

  it('fails when the delegated target file does not exist', () => {
    const result = verifyFile(resolve(fixtures, 'delegated-missing-target.tsx'));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/delegated target not found/i);
  });

  it('passes a redirect-only exempt page', () => {
    const result = verifyFile(resolve(fixtures, 'exempt-redirect-page.tsx'));
    expect(result.ok).toBe(true);
  });
});
