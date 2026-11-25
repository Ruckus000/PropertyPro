/**
 * Move In/Out on the page kit: filter counts, the error state, the open
 * checklist's address (`?checklist=<id>`), and progress said in words.
 *
 * `next/navigation` is stood in by a store over `window.location`, because
 * Next keeps `useSearchParams` in step with `history.pushState` and Back, and
 * that is the behaviour under test. The list hook answers a `type` filter the
 * way the API does (only rows of that type), so a page that asks the server for
 * the filtered set shows wrong counts here just as it did on screen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MOVE_IN_STEPS, MOVE_OUT_STEPS } from '@propertypro/db/constants';

type Row = {
  id: number;
  communityId: number;
  leaseId: number;
  unitId: number;
  unitLabel: string;
  residentId: string;
  type: 'move_in' | 'move_out';
  checklistData: Record<string, { completed: boolean }>;
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

const h = vi.hoisted(() => ({
  listState: { rows: [] as unknown[], isLoading: false, isError: false },
  detailState: { isError: false },
  listRefetch: vi.fn(),
  detailRefetch: vi.fn(),
  listFilters: [] as unknown[],
  urlListeners: new Set<() => void>(),
}));

vi.mock('next/navigation', async () => {
  const React = await import('react');
  return {
    usePathname: () => window.location.pathname,
    useSearchParams: () => {
      const search = React.useSyncExternalStore(
        (onChange: () => void) => {
          h.urlListeners.add(onChange);
          window.addEventListener('popstate', onChange);
          return () => {
            h.urlListeners.delete(onChange);
            window.removeEventListener('popstate', onChange);
          };
        },
        () => window.location.search,
      );
      return React.useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

vi.mock('@/hooks/use-move-checklists', () => ({
  useMoveChecklists: (_communityId: number, filters?: { type?: string }) => {
    h.listFilters.push(filters);
    const rows = h.listState.rows as Row[];
    const data =
      h.listState.isLoading || h.listState.isError
        ? undefined
        : filters?.type
          ? rows.filter((r) => r.type === filters.type)
          : rows;
    return {
      data,
      isLoading: h.listState.isLoading,
      isError: h.listState.isError,
      refetch: h.listRefetch,
    };
  },
  useMoveChecklist: (_communityId: number, id: number) => {
    const row = (h.listState.rows as Row[]).find((r) => r.id === id);
    return {
      data: h.detailState.isError ? undefined : row,
      isLoading: false,
      isError: h.detailState.isError || !row,
      refetch: h.detailRefetch,
    };
  },
  useUpdateChecklistStep: () => ({ mutate: vi.fn(), isPending: false }),
  useTriggerStepAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ChecklistListPage } from '@/components/move-checklists/ChecklistListPage';

function row(id: number, type: Row['type'], extra: Partial<Row> = {}): Row {
  return {
    id,
    communityId: 42,
    leaseId: 100 + id,
    unitId: 900 + id,
    unitLabel: `Unit ${id}A`,
    residentId: `resident-${id}`,
    type,
    checklistData: {},
    completedAt: null,
    completedBy: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

const LIST_URL = '/dashboard/move-in-out?communityId=42';

function tab(name: RegExp): HTMLElement {
  return screen.getByRole('button', { name });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.listFilters.length = 0;
  h.listState.rows = [row(1, 'move_in'), row(2, 'move_in'), row(3, 'move_out')];
  h.listState.isLoading = false;
  h.listState.isError = false;
  h.detailState.isError = false;
  window.history.replaceState(null, '', LIST_URL);
  // Next tells useSearchParams about pushState/replaceState; do the same here.
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = History.prototype[method];
    vi.spyOn(window.history, method).mockImplementation(function (this: History, ...args) {
      original.apply(window.history, args);
      h.urlListeners.forEach((notify) => notify());
    });
  }
});

describe('Move In/Out list', () => {
  it('counts every tab from the whole set, whichever tab is on', () => {
    render(<ChecklistListPage communityId={42} />);

    fireEvent.click(tab(/^Move Out/));

    expect(tab(/^All/)).toHaveTextContent('All3');
    expect(tab(/^Move In/)).toHaveTextContent('Move In2');
    expect(tab(/^Move Out/)).toHaveTextContent('Move Out1');
    expect(tab(/^Move Out/)).toHaveAttribute('aria-pressed', 'true');
    // The filter still narrows the cards.
    expect(screen.getAllByRole('link', { name: /Lease #/ })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Unit 3A/ })).toBeInTheDocument();
  });

  it('says the list could not load and retries', () => {
    h.listState.isError = true;
    render(<ChecklistListPage communityId={42} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load the checklists. Please try again.");
    expect(screen.queryByText(/No checklists yet/)).not.toBeInTheDocument();

    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(h.listRefetch).toHaveBeenCalledTimes(1);
  });

  it('shows the first-run words when there are no checklists', () => {
    h.listState.rows = [];
    render(<ChecklistListPage communityId={42} />);

    expect(screen.getByRole('heading', { name: 'No checklists yet' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('states progress on a card as a number in words, not a bar alone', () => {
    h.listState.rows = [
      row(1, 'move_in', { checklistData: { [MOVE_IN_STEPS[0]!]: { completed: true } } }),
      row(3, 'move_out'),
    ];
    render(<ChecklistListPage communityId={42} />);

    const cards = screen.getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent(`1 of ${MOVE_IN_STEPS.length} steps done`);
    expect(cards[0]).toHaveTextContent('In progress');
    expect(cards[1]).toHaveTextContent(`0 of ${MOVE_OUT_STEPS.length} steps done`);
    expect(cards[1]).toHaveTextContent('Not started');
  });
});

describe('Move In/Out open checklist address', () => {
  it('opening a card pushes ?checklist=<id> and shows that checklist', () => {
    render(<ChecklistListPage communityId={42} />);
    const before = window.history.length;

    fireEvent.click(screen.getByRole('link', { name: /Unit 2A/ }));

    const params = new URLSearchParams(window.location.search);
    expect(params.get('checklist')).toBe('2');
    expect(params.get('communityId')).toBe('42');
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(window.history.length).toBe(before + 1);
    expect(screen.getByRole('heading', { level: 1, name: 'Move-in checklist' })).toBeInTheDocument();
    expect(screen.getByText(/Unit 2A — Lease #102/)).toBeInTheDocument();
  });

  it('a card is a real link to the checklist address', () => {
    render(<ChecklistListPage communityId={42} />);

    expect(screen.getByRole('link', { name: /Unit 2A/ })).toHaveAttribute(
      'href',
      '/dashboard/move-in-out?communityId=42&checklist=2',
    );
  });

  it('loading the page with ?checklist=<id> opens that checklist', () => {
    window.history.replaceState(null, '', `${LIST_URL}&checklist=3`);
    render(<ChecklistListPage communityId={42} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Move-out checklist' })).toBeInTheDocument();
    expect(screen.getByText(/Unit 3A — Lease #103/)).toBeInTheDocument();
    // Said in the Steps section and in the Details panel.
    expect(screen.getAllByText(`0 of ${MOVE_OUT_STEPS.length} steps done`)).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /Lease #/ })).not.toBeInTheDocument();
  });

  it('Back returns to the list', async () => {
    render(<ChecklistListPage communityId={42} />);
    fireEvent.click(screen.getByRole('link', { name: /Unit 2A/ }));
    expect(screen.queryByRole('link', { name: /Lease #/ })).not.toBeInTheDocument();

    act(() => window.history.back());

    await waitFor(() => expect(screen.getAllByRole('link', { name: /Lease #/ })).toHaveLength(3));
    expect(new URLSearchParams(window.location.search).has('checklist')).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: 'Move In/Out' })).toBeInTheDocument();
  });

  it('"Back to checklists" pops the entry this page pushed', async () => {
    render(<ChecklistListPage communityId={42} />);
    fireEvent.click(screen.getByRole('link', { name: /Unit 2A/ }));
    const lengthOpen = window.history.length;

    fireEvent.click(screen.getByRole('button', { name: 'Back to checklists' }));

    await waitFor(() => expect(screen.getAllByRole('link', { name: /Lease #/ })).toHaveLength(3));
    expect(window.location.search).toBe('?communityId=42');
    // Popped, not pushed again: no new entry on top of the open one.
    expect(window.history.length).toBe(lengthOpen);
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it('"Back to checklists" on a checklist opened by its address stays in the app', () => {
    // Arrived on the address (a shared link): the entry carries no mark of ours.
    window.history.replaceState(null, '', `${LIST_URL}&checklist=3`);
    vi.mocked(window.history.replaceState).mockClear();
    const back = vi.spyOn(window.history, 'back');
    render(<ChecklistListPage communityId={42} />);
    expect(document.body).toHaveFocus(); // a page load does not move focus

    fireEvent.click(screen.getByRole('button', { name: 'Back to checklists' }));

    // Back would leave the app, so the id is stripped in place instead.
    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?communityId=42');
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
    expect(window.history.pushState).not.toHaveBeenCalled();
    expect(screen.getAllByRole('link', { name: /Lease #/ })).toHaveLength(3);
  });

  it('open, refresh, "Back to checklists": one history step back, not a second list entry', async () => {
    const first = render(<ChecklistListPage communityId={42} />);
    fireEvent.click(screen.getByRole('link', { name: /Unit 2A/ }));
    // A refresh: the page mounts afresh, the history entry and its state survive.
    first.unmount();
    vi.mocked(window.history.replaceState).mockClear();
    const back = vi.spyOn(window.history, 'back');
    render(<ChecklistListPage communityId={42} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Move-in checklist' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to checklists' }));

    expect(back).toHaveBeenCalledTimes(1);
    expect(window.history.replaceState).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Lease #/ })).toHaveLength(3));
    expect(window.location.search).toBe('?communityId=42');
  });

  it('a second click on the same card does not push a second entry', () => {
    render(<ChecklistListPage communityId={42} />);
    const link = screen.getByRole('link', { name: /Unit 2A/ });

    // Both clicks land before React re-renders, as a double click does.
    act(() => {
      link.click();
      link.click();
    });

    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(window.location.search).get('checklist')).toBe('2');
  });

  it('opening moves focus to the checklist title; closing returns it to the card', async () => {
    render(<ChecklistListPage communityId={42} />);

    fireEvent.click(screen.getByRole('link', { name: /Unit 2A/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Move-in checklist' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Back to checklists' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Unit 2A/ })).toHaveFocus());
  });

  it('closing a checklist whose card is filtered away puts focus on the list title', async () => {
    render(<ChecklistListPage communityId={42} />);
    fireEvent.click(screen.getByRole('link', { name: /Unit 3A/ }));
    act(() => window.history.back());
    await waitFor(() => expect(screen.getAllByRole('link', { name: /Lease #/ })).toHaveLength(3));
    // Hide the move-out card, then return to its checklist with Forward.
    fireEvent.click(tab(/^Move In/));
    act(() => window.history.forward());
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Move-out checklist' })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Back to checklists' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Move In/Out' })).toHaveFocus(),
    );
    expect(screen.queryByRole('link', { name: /Unit 3A/ })).not.toBeInTheDocument();
  });

  it.each(['999', 'abc', '0'])('an unknown id (%s) shows the list with a plain note', (id) => {
    window.history.replaceState(null, '', `${LIST_URL}&checklist=${id}`);
    render(<ChecklistListPage communityId={42} />);

    // The shared AlertBanner: role="alert", so it is announced when it appears.
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't find that checklist. It may have been removed.",
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Move In/Out' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Lease #/ })).toHaveLength(3);
  });

  it('says an open checklist could not load, retries, and can go back', () => {
    h.listState.isError = true;
    h.detailState.isError = true;
    window.history.replaceState(null, '', `${LIST_URL}&checklist=3`);
    render(<ChecklistListPage communityId={42} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load this checklist. Please try again.");
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(h.detailRefetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Back to checklists' })).toBeInTheDocument();
  });
});
