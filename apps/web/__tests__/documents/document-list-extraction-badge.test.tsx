import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  DocumentList,
  ExtractionStatusBadge,
  type ExtractionStatus,
} from '../../src/components/documents/document-list';

async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ExtractionStatusBadge', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders green "Searchable" badge for completed status', async () => {
    await act(async () => {
      root.render(<ExtractionStatusBadge status="completed" />);
    });

    const badge = container.querySelector('[data-testid="extraction-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('Searchable');
    expect(badge?.getAttribute('data-extraction-status')).toBe('completed');
    expect(badge?.className).toContain('bg-status-success-bg');
  });

  it('renders yellow "Processing" badge for pending status', async () => {
    await act(async () => {
      root.render(<ExtractionStatusBadge status="pending" />);
    });

    const badge = container.querySelector('[data-testid="extraction-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('Processing');
    expect(badge?.className).toContain('bg-status-warning-bg');
  });

  it('renders red "Search unavailable" badge for failed status', async () => {
    await act(async () => {
      root.render(<ExtractionStatusBadge status="failed" />);
    });

    const badge = container.querySelector('[data-testid="extraction-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('Search unavailable');
    expect(badge?.className).toContain('bg-status-danger-bg');
  });

  it('renders gray "Not searchable" badge for skipped status', async () => {
    await act(async () => {
      root.render(<ExtractionStatusBadge status="skipped" />);
    });

    const badge = container.querySelector('[data-testid="extraction-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('Not searchable');
    expect(badge?.className).toContain('bg-surface-muted');
  });

  it('renders nothing for not_applicable status', async () => {
    await act(async () => {
      root.render(<ExtractionStatusBadge status="not_applicable" />);
    });

    const badge = container.querySelector('[data-testid="extraction-badge"]');
    expect(badge).toBeNull();
  });

  it('renders nothing for null status (backward compat)', async () => {
    await act(async () => {
      root.render(<ExtractionStatusBadge status={null} />);
    });

    const badge = container.querySelector('[data-testid="extraction-badge"]');
    expect(badge).toBeNull();
  });

  it('renders nothing for undefined status (backward compat)', async () => {
    await act(async () => {
      root.render(<ExtractionStatusBadge status={undefined} />);
    });

    const badge = container.querySelector('[data-testid="extraction-badge"]');
    expect(badge).toBeNull();
  });
});

describe('DocumentList extraction badges', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it('renders extraction badges for documents with various statuses', async () => {
    const mockDocuments = [
      {
        id: 1,
        title: 'PDF Completed',
        description: null,
        fileName: 'test.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        categoryId: null,
        createdAt: '2026-01-15T00:00:00Z',
        uploadedBy: null,
        extractionStatus: 'completed' as ExtractionStatus,
      },
      {
        id: 2,
        title: 'PDF Pending',
        description: null,
        fileName: 'pending.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        categoryId: null,
        createdAt: '2026-01-15T00:00:00Z',
        uploadedBy: null,
        extractionStatus: 'pending' as ExtractionStatus,
      },
      {
        id: 3,
        title: 'Word Doc',
        description: null,
        fileName: 'doc.docx',
        fileSize: 512,
        mimeType: 'application/msword',
        categoryId: null,
        createdAt: '2026-01-15T00:00:00Z',
        uploadedBy: null,
        extractionStatus: 'not_applicable' as ExtractionStatus,
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockDocuments }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<DocumentList communityId={42} />);
      await flushEffects();
    });

    const badges = container.querySelectorAll('[data-testid="extraction-badge"]');
    // Only 2 badges should render (completed and pending; not_applicable renders nothing)
    expect(badges.length).toBe(2);

    const statusValues = Array.from(badges).map((b) => b.getAttribute('data-extraction-status'));
    expect(statusValues).toContain('completed');
    expect(statusValues).toContain('pending');
  });

  it('handles documents without extractionStatus (backward compat)', async () => {
    const mockDocuments = [
      {
        id: 1,
        title: 'Legacy Document',
        description: null,
        fileName: 'legacy.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        categoryId: null,
        createdAt: '2026-01-15T00:00:00Z',
        uploadedBy: null,
        // No extractionStatus field — simulates pre-migration data
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: mockDocuments }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await act(async () => {
      root.render(<DocumentList communityId={42} />);
      await flushEffects();
    });

    // Should render the document but no badge
    expect(container.textContent).toContain('Legacy Document');
    const badges = container.querySelectorAll('[data-testid="extraction-badge"]');
    expect(badges.length).toBe(0);
  });
});
