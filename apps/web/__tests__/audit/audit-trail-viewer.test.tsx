/**
 * The redesigned audit trail page, as a manager uses it: plain sentences with
 * names (never ids), visible Show choices, one search that narrows to a person
 * or thing, a side panel with what changed, and every loading/empty/error state.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { replaceMock, navState } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  navState: { search: 'communityId=42' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => '/audit-trail',
  useSearchParams: () => new URLSearchParams(navState.search),
}));

import { AuditTrailViewer } from '../../src/components/audit/AuditTrailViewer';

const MARIA = '11111111-1111-1111-1111-111111111111';
const ANA = '22222222-2222-2222-2222-222222222222';
const now = new Date().toISOString();

function row(overrides: Record<string, unknown>) {
  return {
    id: 1,
    userId: MARIA,
    communityId: 42,
    action: 'create',
    resourceType: 'document',
    resourceId: '10',
    oldValues: null,
    newValues: null,
    metadata: null,
    createdAt: now,
    ...overrides,
  };
}

const ENTRIES = [
  row({ id: 4790, action: 'delete', oldValues: { title: '2025 Reserve Study.pdf', filePath: 'x/y.pdf' } }),
  row({
    id: 4788,
    action: 'role_assigned',
    resourceType: 'community',
    resourceId: '42',
    newValues: { userId: ANA, role: 'property_manager' },
  }),
  row({
    id: 4770,
    userId: null,
    action: 'data_repair',
    resourceType: 'document_categories',
    resourceId: '3',
    newValues: { name: 'Financial' },
    metadata: { reason: 'duplicate categories after import' },
  }),
];

let auditResponse: () => Response;
const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function payload(entries: unknown[], extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      data: {
        data: entries,
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
        users: { [MARIA]: 'Maria Lopez', [ANA]: 'Ana Ruiz' },
        resources: {},
        hiddenRoutineCount: 178,
        scopeLabel: null,
        ...extra,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function searchResponse() {
  return new Response(
    JSON.stringify({
      data: {
        requestId: 'r',
        communityId: 42,
        partial: false,
        groups: [
          {
            key: 'documents',
            label: 'Documents',
            status: 'ok',
            totalCount: 1,
            durationMs: 1,
            results: [{ id: 10, title: 'Budget 2026.pdf', subtitle: 'Financial', href: '/d/10', entityType: 'document', relevance: 1 }],
          },
        ],
      },
    }),
    { status: 200 },
  );
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function lastAuditUrl(): URL {
  const calls = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/api/v1/audit-trail'));
  return new URL(calls.at(-1)!, 'http://x');
}

function renderViewer(syncUrl = false) {
  return render(wrap(<AuditTrailViewer communityId={42} timeZone="America/New_York" syncUrl={syncUrl} />));
}

describe('AuditTrailViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navState.search = 'communityId=42';
    auditResponse = () => payload(ENTRIES);
    fetchMock.mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.startsWith('/api/v1/search')) return Promise.resolve(searchResponse());
      return Promise.resolve(auditResponse());
    });
  });

  it('shows skeleton rows while loading', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderViewer();
    expect(screen.getByLabelText('Loading activity')).toBeInTheDocument();
  });

  it('asks for Important activity in the last 30 days by default', async () => {
    renderViewer();
    await screen.findByText('2025 Reserve Study.pdf');
    const url = lastAuditUrl();
    expect(url.searchParams.get('view')).toBe('important');
    expect(url.searchParams.get('period')).toBe('30');
  });

  it('writes each event as a sentence with names, never ids or raw codes', async () => {
    renderViewer();
    expect(await screen.findByText('Today')).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Today' });
    expect(within(list).getByText(/deleted the document/)).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Ana Ruiz' })).toBeInTheDocument();
    expect(list.textContent).toContain('PropertyPro support');
    expect(list.textContent).not.toContain(MARIA);
    expect(list.textContent).not.toContain('data_repair');
  });

  it('gives a deletion a badge with an icon and words, not colour alone', async () => {
    renderViewer();
    const badge = (await screen.findAllByText('Deleted'))[0]!;
    expect(badge.closest('span')?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows every Show choice with a visible resting style, Important selected', async () => {
    renderViewer();
    await screen.findByText('2025 Reserve Study.pdf');
    const important = screen.getByRole('radio', { name: 'Important' });
    const everything = screen.getByRole('radio', { name: 'Everything' });
    expect(important).toHaveAttribute('aria-checked', 'true');
    expect(everything).toHaveAttribute('aria-checked', 'false');
    // Unselected pills are filled and bordered at rest, not only on hover.
    expect(everything.className).toContain('bg-surface-card');
    expect(everything.className).toContain('border-edge-strong');
    expect(everything.className).toContain('text-content');
  });

  it('says how many routine events are hidden, and shows them on request', async () => {
    renderViewer();
    expect(await screen.findByText(/178 routine events, like document views/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show everything' }));
    await waitFor(() => expect(lastAuditUrl().searchParams.get('view')).toBe('all'));
    expect(screen.getByRole('radio', { name: 'Everything' })).toHaveAttribute('aria-checked', 'true');
  });

  it('narrows to a person when their name is clicked, and offers a printable record', async () => {
    renderViewer();
    fireEvent.click(await screen.findByRole('button', { name: 'Ana Ruiz' }));
    await waitFor(() => expect(lastAuditUrl().searchParams.get('person')).toBe(ANA));
    expect(lastAuditUrl().searchParams.get('view')).toBe('all');
    expect(await screen.findByText('Everything that happened by or to Ana Ruiz, newest first.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Print record/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/audit-trail/print?'),
    );
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();

    // Clearing returns to the unfiltered list (served from cache, so assert the screen).
    fireEvent.click(screen.getByRole('button', { name: 'Stop showing only Ana Ruiz' }));
    expect(await screen.findByRole('link', { name: /Download/ })).toBeInTheDocument();
    expect(screen.getByText('A permanent record of what happened in your community and who did it.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Important' })).toHaveAttribute('aria-checked', 'true');
  });

  it('suggests people and things from search, and narrows to the one picked', async () => {
    renderViewer();
    await screen.findByText('2025 Reserve Study.pdf');
    const box = screen.getByRole('combobox', { name: 'Search for a person, document, or unit' });
    fireEvent.change(box, { target: { value: 'bud' } });
    const option = await screen.findByRole('option', { name: /Budget 2026\.pdf/ });
    expect(within(option).getByText('Document')).toBeInTheDocument();
    fireEvent.mouseDown(option);
    await waitFor(() => {
      expect(lastAuditUrl().searchParams.get('entity')).toBe('document');
      expect(lastAuditUrl().searchParams.get('item')).toBe('10');
    });
  });

  it('opens a side panel with what changed, and closes on Escape back to the row', async () => {
    renderViewer();
    await screen.findByText('2025 Reserve Study.pdf');
    const rowButton = screen.getByRole('button', { name: /^Details: Maria Lopez deleted the document/ });
    rowButton.focus();
    fireEvent.click(rowButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('What changed')).toBeInTheDocument();
    expect(within(dialog).getByText('Title')).toBeInTheDocument();
    expect(within(dialog).queryByText(/filePath|x\/y\.pdf/)).toBeNull();
    expect(within(dialog).getByText(/check your compliance checklist/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open compliance checklist' })).toHaveAttribute(
      'href',
      '/communities/42/compliance',
    );
    expect(within(dialog).getByText('Record #4790')).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(rowButton));
  });

  it('keeps the recorded reason for a database repair readable', async () => {
    renderViewer();
    fireEvent.click(await screen.findByRole('button', { name: /^Details: PropertyPro support corrected/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/duplicate categories after import/)).toBeInTheDocument();
  });

  it('explains an empty result and offers a way out', async () => {
    auditResponse = () => payload([], { hiddenRoutineCount: 0 });
    renderViewer();
    expect(await screen.findByText('Nothing in the last 30 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look further back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show everything' })).toBeInTheDocument();
  });

  it('shows an error banner with a retry when loading fails', async () => {
    auditResponse = () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 });
    renderViewer();
    expect(await screen.findByText('We couldn’t load the audit trail')).toBeInTheDocument();
    auditResponse = () => payload(ENTRIES);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2025 Reserve Study.pdf')).toBeInTheDocument();
  });

  describe('address bar', () => {
    it('writes the chosen view to the URL', async () => {
      const replaceState = vi.spyOn(window.history, 'replaceState');
      renderViewer(true);
      await screen.findByText('2025 Reserve Study.pdf');
      fireEvent.click(screen.getByRole('radio', { name: 'Deleted' }));
      expect(replaceState).toHaveBeenCalledWith(null, '', '/audit-trail?communityId=42&view=deleted');
      replaceState.mockRestore();
    });

    it('reopens a shared link: the scope and the open entry', async () => {
      navState.search = `communityId=42&person=${MARIA}&view=all&entry=4790`;
      renderViewer(true);
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Record #4790')).toBeInTheDocument();
      expect(lastAuditUrl().searchParams.get('person')).toBe(MARIA);
    });

    it('falls back to the default view for a malformed link instead of crashing', async () => {
      navState.search = 'communityId=42&view=nonsense';
      renderViewer(true);
      await screen.findByText('2025 Reserve Study.pdf');
      expect(lastAuditUrl().searchParams.get('view')).toBe('important');
    });
  });
});
