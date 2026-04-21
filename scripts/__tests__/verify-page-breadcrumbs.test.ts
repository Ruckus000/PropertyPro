import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { verifyFile } from '../verify-page-breadcrumbs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../__fixtures__/breadcrumbs');

describe('verifyFile', () => {
  it('passes a file with PageHeader breadcrumb prop', () => {
    const result = verifyFile(resolve(fixtures, 'passing-page.tsx'));
    expect(result.ok).toBe(true);
  });

  it('fails a file with PageHeader but no breadcrumb prop', () => {
    const result = verifyFile(resolve(fixtures, 'failing-page.tsx'));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no breadcrumb/i);
  });

  it('passes a delegated page when target file has breadcrumb', () => {
    const result = verifyFile(resolve(fixtures, 'delegated-page.tsx'));
    expect(result.ok).toBe(true);
  });

  it('fails when delegated target file does not exist', () => {
    const result = verifyFile(resolve(fixtures, 'delegated-missing-target.tsx'));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/delegated target not found/i);
  });

  it('passes a redirect-only exempt page', () => {
    const result = verifyFile(resolve(fixtures, 'exempt-redirect-page.tsx'));
    expect(result.ok).toBe(true);
  });
});
