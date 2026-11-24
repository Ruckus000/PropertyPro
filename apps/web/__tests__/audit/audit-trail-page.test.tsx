/**
 * The Audit Trail route on the page kit (`audit-trail-page.tsx`), and the
 * viewer still embedded, unframed, in the compliance page's history dialog.
 *
 * The viewer's own behaviour (sentences, search, side panel, states) is pinned
 * in audit-trail-viewer.test.tsx; this file pins what the frame decides.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { navState } = vi.hoisted(() => ({ navState: { search: 'communityId=42' } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/audit-trail',
  useSearchParams: () => new URLSearchParams(navState.search),
}));

import { describeAccess } from '@/lib/access/describe-access';
import { AuditTrailPage } from '@/components/audit/audit-trail-page';
import { ComplianceActivityHistoryModal } from '@/components/compliance/compliance-activity-history-modal';

const MARIA = '11111111-1111-1111-1111-111111111111';
const PERMANENT = 'Entries are permanent. Nobody can edit or delete them.';
const INTRO = 'A permanent record of what happened in your community and who did it.';
const about = describeAccess('condo_718', 'audit', 'all');

const ENTRY = {
  id: 4790,
  userId: MARIA,
  communityId: 42,
  action: 'delete',
  resourceType: 'document',
  resourceId: '10',
  oldValues: { title: '2025 Reserve Study.pdf' },
  newValues: null,
  metadata: null,
  createdAt: new Date().toISOString(),
};

let extra: Record<string, unknown>;
const fetchMock = vi.fn();

function payload() {
  return new Response(
    JSON.stringify({
      data: {
        data: [ENTRY],
        pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
        users: { [MARIA]: 'Maria Lopez' },
        resources: {},
        hiddenRoutineCount: 0,
        scopeLabel: null,
        ...extra,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function renderPage() {
  return render(wrap(<AuditTrailPage communityId={42} timeZone="America/New_York" about={about} />));
}

beforeEach(() => {
  vi.clearAllMocks();
  navState.search = 'communityId=42';
  extra = {};
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockImplementation(() => Promise.resolve(payload()));
});

describe('AuditTrailPage (the route, on the page kit)', () => {
  it('paints the title and one description sentence in a list page', async () => {
    const { container } = renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    expect(container.querySelector('[data-page-template="list"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Audit Trail' })).toBeInTheDocument();
    expect(screen.getAllByText(INTRO)).toHaveLength(1);
  });

  it('offers Download CSV in the header while the list is not narrowed', async () => {
    const { container } = renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    const header = container.querySelector<HTMLElement>('[data-page-header]')!;
    const link = within(header).getByRole('link', { name: 'Download CSV' });
    expect(link).toHaveAttribute('href', '/api/v1/audit-trail?communityId=42&view=important&period=30&format=csv');
    expect(link).toHaveAttribute('download');
    expect(screen.queryByRole('link', { name: /Print record/ })).toBeNull();
    // One export link on the page, and it is the header's.
    expect(screen.getAllByRole('link', { name: /Download/ })).toHaveLength(1);
  });

  it('offers Print record in the header once narrowed to one person, and names them', async () => {
    navState.search = `communityId=42&person=${MARIA}&view=all`;
    extra = { scopeLabel: 'Maria Lopez' };
    const { container } = renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    const header = container.querySelector<HTMLElement>('[data-page-header]')!;
    const link = within(header).getByRole('link', { name: 'Print record' });
    expect(link).toHaveAttribute('href', `/audit-trail/print?communityId=42&view=all&period=30&person=${MARIA}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Maria Lopez' })).toBeInTheDocument();
    expect(screen.getByText('Everything that happened by or to Maria Lopez, newest first.')).toBeInTheDocument();
  });

  it('says who can see the page, from the permission matrix', async () => {
    expect(about).toBe('Managers can see these.');
    renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    expect(screen.getByText('Managers can see these.')).toBeInTheDocument();
  });

  it('shows the Show choices as ink filters that are still a radio group', async () => {
    renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    const group = screen.getByRole('radiogroup', { name: 'Show' });
    const important = within(group).getByRole('radio', { name: 'Important' });
    const everything = within(group).getByRole('radio', { name: 'Everything' });
    expect(important).toHaveAttribute('aria-checked', 'true');
    expect(important.className).toContain('bg-surface-muted');
    expect(important.className).toContain('font-semibold');
    expect(everything).toHaveAttribute('aria-checked', 'false');
    expect(everything.className).not.toContain('border-edge-strong');
    expect(everything.className).not.toContain('rounded-full');
  });

  it('keeps the permanence sentence, word for word, as the section footer', async () => {
    renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    const section = screen.getByTestId('audit-trail-section');
    const note = within(section).getByText(PERMANENT);
    // The footer is the last thing in the section's live region, under the list.
    const live = section.querySelector<HTMLElement>('[aria-live="polite"]')!;
    expect(section.lastElementChild).toBe(live);
    expect(live.lastElementChild).toContainElement(note);
    expect(live.lastElementChild?.className).toContain('border-t');
    // Interface text size, not the footer's caption size.
    expect(note.parentElement?.className).toContain('text-sm');
  });

  it('says how many routine events are hidden in the footer instead, when some are', async () => {
    extra = { hiddenRoutineCount: 178 };
    renderPage();
    const section = await screen.findByTestId('audit-trail-section');
    expect(await within(section).findByText(/178 routine events, like document views/)).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Show everything' })).toBeInTheDocument();
    expect(screen.queryByText(PERMANENT)).toBeNull();
  });

  it('shows skeleton rows under the real header while loading, with one busy region', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Audit Trail' })).toBeInTheDocument();
    const section = screen.getByTestId('audit-trail-section');
    expect(within(section).getByLabelText('Loading activity')).toBeInTheDocument();
    expect(section).not.toHaveAttribute('aria-busy');
    const busy = section.querySelectorAll('[aria-busy]');
    expect(busy).toHaveLength(1);
    expect(busy[0]).toHaveAttribute('aria-busy', 'true');
    expect(busy[0]).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByText(PERMANENT)).toBeNull();
  });

  it('shows the error banner in the section, and Try again loads the list', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 })),
    );
    renderPage();
    const section = await screen.findByTestId('audit-trail-section');
    expect(await within(section).findByText('We couldn’t load the audit trail')).toBeInTheDocument();
    expect(screen.queryByText(PERMANENT)).toBeNull();
    const before = fetchMock.mock.calls.length;
    fetchMock.mockImplementation(() => Promise.resolve(payload()));
    fireEvent.click(within(section).getByRole('button', { name: 'Try again' }));
    expect(await within(section).findByText('2025 Reserve Study.pdf')).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  it('explains an empty result in the section and offers a way out, with no footer', async () => {
    extra = { data: [] };
    renderPage();
    const section = await screen.findByTestId('audit-trail-section');
    expect(await within(section).findByText('Nothing in the last 30 days')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Look further back' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Show everything' })).toBeInTheDocument();
    expect(screen.queryByText(PERMANENT)).toBeNull();
    // The filters stay.
    expect(within(section).getByRole('radiogroup', { name: 'Show' })).toBeInTheDocument();
  });

  it('offers "Show older activity" under the list, and it loads the next page', async () => {
    fetchMock.mockImplementation((input: RequestInfo) => {
      if (new URL(String(input), 'http://x').searchParams.get('cursor') === 'c1') {
        extra = { data: [{ ...ENTRY, id: 4001, oldValues: { title: 'Older Minutes.pdf' } }] };
      } else {
        extra = { pagination: { nextCursor: 'c1', hasMore: true, pageSize: 50 } };
      }
      return Promise.resolve(payload());
    });
    renderPage();
    const section = await screen.findByTestId('audit-trail-section');
    await within(section).findByText('2025 Reserve Study.pdf');
    const older = within(section).getByRole('button', { name: 'Show older activity' });
    // In the list's own block, not squeezed into the footer row beside the note.
    expect(within(section).getByText(PERMANENT).closest('div')).not.toContainElement(older);
    fireEvent.click(older);
    expect(await within(section).findByText('Older Minutes.pdf')).toBeInTheDocument();
    expect(within(section).getByText('2025 Reserve Study.pdf')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show older activity' })).toBeNull());
  });

  it('opens the details sheet for the entry in the link, and puts a clicked row in the address bar', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    navState.search = 'communityId=42&entry=4790';
    renderPage();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('What changed')).toBeInTheDocument();
    expect(within(dialog).getByText('Record #4790')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Details: Maria Lopez deleted the document/, hidden: true }));
    expect(replaceState).toHaveBeenCalledWith(null, '', '/audit-trail?communityId=42&entry=4790');
    replaceState.mockRestore();
  });

  it('draws the search box with the control border', async () => {
    renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    const box = screen.getByRole('combobox', { name: 'Search for a person, document, or unit' });
    expect(box.parentElement?.className).toContain('border-edge-control');
  });

  it('lets the Show choices wrap on a phone instead of scrolling out of sight', async () => {
    renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    const group = screen.getByRole('radiogroup', { name: 'Show' });
    expect(group.className).toContain('flex-wrap');
    expect(within(group).getByRole('radio', { name: 'Notices' }).className).toContain('h-11');
  });

  it('keeps the chosen view in the address bar', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderPage();
    await screen.findByText('2025 Reserve Study.pdf');
    fireEvent.click(screen.getByRole('radio', { name: 'Deleted' }));
    expect(replaceState).toHaveBeenCalledWith(null, '', '/audit-trail?communityId=42&view=deleted');
    replaceState.mockRestore();
  });
});

describe('the viewer embedded in the compliance history dialog', () => {
  it('is not framed as a page and keeps its own layout, pills and footer', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    render(wrap(<ComplianceActivityHistoryModal communityId={42} open onOpenChange={() => {}} />));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('2025 Reserve Study.pdf');

    // No page frame, no page title, no "about" sentence.
    expect(document.querySelector('[data-page-template]')).toBeNull();
    expect(document.querySelector('[data-page-header]')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByText('Managers can see these.')).toBeNull();

    // Its own intro and its own Download link, under the old label.
    expect(within(dialog).getByText(INTRO)).toBeInTheDocument();
    const download = within(dialog).getByRole('link', { name: 'Download' });
    expect(download).toHaveAttribute('href', '/api/v1/audit-trail?communityId=42&view=important&period=30&format=csv');

    // Bordered pills, not ink filters.
    const everything = within(dialog).getByRole('radio', { name: 'Everything' });
    expect(everything.className).toContain('rounded-full');
    expect(everything.className).toContain('border-edge-strong');
    expect(everything.className).toContain('bg-surface-card');
    expect(within(dialog).getByRole('radio', { name: 'Important' }).className).toContain('bg-interactive-subtle');

    // The permanence sentence in its own ruled paragraph.
    const note = within(dialog).getByText(PERMANENT).closest('p')!;
    expect(note.className).toContain('border-t');
    expect(note.className).toContain('text-sm');

    // In memory, never the address bar.
    fireEvent.click(everything);
    expect(everything).toHaveAttribute('aria-checked', 'true');
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });
});
