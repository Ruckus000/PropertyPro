/**
 * The templates list had no row actions at all: every verb lived one click
 * deeper on the detail page, and the two verbs there were both broken links
 * to the blank builder. These assert the row-level Send and Edit reach the
 * right places and are withheld when the template cannot honour them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

const useEsignTemplatesMock = vi.fn();
vi.mock('@/hooks/use-esign-templates', () => ({
  useEsignTemplates: (...args: unknown[]) => useEsignTemplatesMock(...args),
}));

import { EsignTemplatesListClient } from '../../src/app/(authenticated)/esign/templates/templates-list-client';

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: 'Proxy Form',
    description: null,
    status: 'active',
    templateType: 'proxy',
    sourceDocumentPath: 'communities/1/esign/proxy.pdf',
    fieldsSchema: { version: 1, fields: [], signerRoles: ['signer'] },
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function renderList(templates: Record<string, unknown>[]) {
  useEsignTemplatesMock.mockReturnValue({
    data: templates,
    isLoading: false,
    error: null,
  });
  return render(<EsignTemplatesListClient communityId={1} />);
}

/** The row for a template, minus the header row. */
function rowFor(name: string) {
  const cell = screen.getByText(name).closest('tr');
  if (!cell) throw new Error(`no row for ${name}`);
  return within(cell);
}

beforeEach(() => {
  useEsignTemplatesMock.mockReset();
});

describe('EsignTemplatesListClient — row actions', () => {
  it('offers Send and Edit on every row that can honour them', () => {
    renderList([template()]);
    const row = rowFor('Proxy Form');

    expect(row.getByRole('link', { name: /Send/i }).getAttribute('href')).toBe(
      '/esign/submissions/new?communityId=1&templateId=5',
    );
    expect(row.getByRole('link', { name: /Edit/i }).getAttribute('href')).toBe(
      '/esign/templates/5/edit?communityId=1',
    );
  });

  it('withholds Send from a template with no source PDF', () => {
    // Sending would fail server-side with "Template must have a source PDF".
    renderList([template({ sourceDocumentPath: null })]);
    const row = rowFor('Proxy Form');

    expect(row.queryByRole('link', { name: /Send/i })).toBeNull();
    expect(row.getByRole('link', { name: /Edit/i })).toBeDefined();
  });

  it('still links each row to its detail page', () => {
    renderList([template()]);

    expect(
      screen.getByRole('link', { name: 'Proxy Form' }).getAttribute('href'),
    ).toBe('/esign/templates/5?communityId=1');
  });

  it('keeps the actions per row when several templates are listed', () => {
    renderList([template(), template({ id: 9, name: 'Consent Form' })]);

    expect(rowFor('Consent Form').getByRole('link', { name: /Edit/i }).getAttribute('href')).toBe(
      '/esign/templates/9/edit?communityId=1',
    );
    expect(rowFor('Proxy Form').getByRole('link', { name: /Edit/i }).getAttribute('href')).toBe(
      '/esign/templates/5/edit?communityId=1',
    );
  });
});
