/**
 * Tests for the full-archive export card.
 *
 * The load-bearing behaviours, all of them cases where a plausible-looking UI
 * would mislead a board member about their own statutory records:
 *
 *   1. Manifest warnings are rendered, not just counted. An export that looks
 *      complete but silently dropped files is worse than one that failed.
 *   2. A deduplicated request reads as "already running", not as an error.
 *   3. Download URLs are minted on CLICK — never at render — because every one
 *      is audit-logged as "this user downloaded the whole association".
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { ExportJobCard } from '@/components/settings/export-job-card';

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function okResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

const READY_JOB = {
  id: 7,
  communityId: 42,
  status: 'ready',
  includeDocumentFiles: true,
  manifest: {},
  warningCount: 0,
  totalBytes: 2048,
  partCount: 1,
  errorMessage: null,
  queuedAt: '2026-08-10T00:00:00Z',
  completedAt: '2026-08-10T00:05:00Z',
  expiresAt: '2026-08-24T00:00:00Z',
};

const PART = { id: 1, partIndex: 0, byteSize: 2048, fileCount: 12 };

/** Routes each fetch by URL so order-of-call does not matter. */
function mockFetch(handlers: {
  jobs?: unknown;
  detail?: unknown;
  post?: unknown;
  download?: unknown;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') return okResponse(handlers.post ?? { job: READY_JOB, deduplicated: false });
    if (url.includes('/download')) {
      return okResponse(
        handlers.download ?? {
          url: 'https://storage.example/signed',
          fileName: 'part-000.zip',
          byteSize: 2048,
          expiresInSeconds: 900,
        },
      );
    }
    if (/\/export\/jobs\/\d+\?/.test(url)) {
      return okResponse(handlers.detail ?? { job: READY_JOB, parts: [PART] });
    }
    return okResponse(handlers.jobs ?? { jobs: [READY_JOB] });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ExportJobCard', () => {
  it('renders a ready job with its download and expiry', async () => {
    mockFetch({});

    render(wrap(<ExportJobCard communityId={42} />));

    expect(await screen.findByText(/Ready to download/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Download part 1/i })).toBeInTheDocument();
    // The expiry is the difference between "come back later" and "gone".
    expect(screen.getByText(/deleted on/i)).toBeInTheDocument();
  });

  it('RENDERS the manifest warnings, not just a count', async () => {
    mockFetch({
      detail: {
        job: {
          ...READY_JOB,
          warningCount: 1,
          manifest: {
            warnings: [
              { code: 'DOCUMENT_FILE_MISSING', detail: 'document 5: object not found', documentId: 5 },
            ],
          },
        },
        parts: [PART],
      },
    });

    render(wrap(<ExportJobCard communityId={42} />));

    expect(await screen.findByText(/1 item could not be included/i)).toBeInTheDocument();
    expect(screen.getByText(/document 5: object not found/i)).toBeInTheDocument();
  });

  it('reports a deduplicated request as already running, NOT as an error', async () => {
    const fetchMock = mockFetch({
      jobs: { jobs: [] },
      post: { job: { ...READY_JOB, status: 'running' }, deduplicated: true },
    });

    render(wrap(<ExportJobCard communityId={42} />));
    await userEvent.click(
      await screen.findByRole('button', { name: /Prepare full archive/i }),
    );

    expect(await screen.findByText(/already being prepared/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST'),
    ).toBe(true);
  });

  it('does NOT mint a download URL until the button is clicked', async () => {
    // Each mint is audit-logged as a whole-association download, so prefetching
    // would write an audit entry for something the user never did.
    const fetchMock = mockFetch({});

    render(wrap(<ExportJobCard communityId={42} />));
    const button = await screen.findByRole('button', { name: /Download part 1/i });

    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/download'))).toBe(false);

    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    await userEvent.click(button);

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/download'))).toBe(true);
    });
  });

  it('offers Cancel only while a job is in flight', async () => {
    mockFetch({
      jobs: { jobs: [{ ...READY_JOB, status: 'running' }] },
      detail: { job: { ...READY_JOB, status: 'running' }, parts: [] },
    });

    render(wrap(<ExportJobCard communityId={42} />));

    expect(await screen.findByRole('button', { name: /^Cancel$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preparing/i })).toBeDisabled();
  });

  it('tells the user an expired archive can be re-requested for free', async () => {
    mockFetch({
      jobs: { jobs: [{ ...READY_JOB, status: 'expired' }] },
      detail: { job: { ...READY_JOB, status: 'expired' }, parts: [] },
    });

    render(wrap(<ExportJobCard communityId={42} />));

    expect(await screen.findByText(/no charge/i)).toBeInTheDocument();
  });

  it('surfaces a failure message rather than looking idle', async () => {
    mockFetch({
      jobs: { jobs: [{ ...READY_JOB, status: 'failed', errorMessage: 'storage unavailable' }] },
      detail: {
        job: { ...READY_JOB, status: 'failed', errorMessage: 'storage unavailable' },
        parts: [],
      },
    });

    render(wrap(<ExportJobCard communityId={42} />));

    expect(await screen.findByText(/Preparation failed/i)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('storage unavailable');
  });
});
