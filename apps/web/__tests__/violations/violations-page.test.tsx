import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { ViolationItem } from '@/lib/api/violations';
import type { ViolationCardFields } from '@/lib/violations/resident-lists';
import type { ViolationsTab } from '@/lib/violations/violations-view';

const { useReviewMock, replaceMock, routerReplaceMock, refetchMock, searchParamsRef } = vi.hoisted(() => ({
  useReviewMock: vi.fn(),
  replaceMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  refetchMock: vi.fn(),
  searchParamsRef: { current: new URLSearchParams('communityId=1') },
}));

vi.mock('@/hooks/use-violations-review', () => ({ useViolationsReview: useReviewMock }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  useSearchParams: () => searchParamsRef.current,
  usePathname: () => '/violations',
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ViolationsPage } from '@/components/violations/violations-page';

function item(id: number, over: Partial<ViolationItem> = {}): ViolationItem {
  return {
    id,
    communityId: 1,
    unitId: id,
    unitLabel: `Unit ${id}`,
    reportedByUserId: null,
    category: 'noise',
    description: `Case ${id} first line\nsecond line`,
    status: 'noticed',
    severity: 'minor',
    evidenceDocumentIds: [],
    noticeDate: null,
    hearingDate: null,
    hearingLocation: null,
    resolutionDate: null,
    resolutionNotes: null,
    createdAt: '2026-11-12T15:00:00.000Z',
    updatedAt: '2026-11-12T15:00:00.000Z',
    ...over,
  };
}

const SIX: ViolationItem[] = [
  item(5, { category: 'parking', unitLabel: 'Unit 412', status: 'reported', severity: 'major' }),
  item(6, { status: 'reported' }),
  item(7, { status: 'noticed' }),
  item(8, { status: 'hearing_scheduled' }),
  item(9, { status: 'resolved' }),
  item(10, { status: 'dismissed' }),
];

function card(id: number, over: Partial<ViolationCardFields> = {}): ViolationCardFields {
  return {
    id,
    unitId: 3,
    category: 'noise',
    description: `Mine ${id}`,
    status: 'reported',
    severity: 'minor',
    createdAt: '2026-11-12T15:00:00.000Z',
    reportedByRole: 'resident',
    unitLabel: 'Unit 3',
    ...over,
  };
}

type Mine = {
  residentUnitIds: number[];
  onYourUnit: ViolationCardFields[];
  yourReports: ViolationCardFields[];
};

function mount(
  over: {
    tabs?: ViolationsTab[];
    initialTab?: ViolationsTab;
    finesEnabled?: boolean;
    mine?: Mine | null;
    initialUnitId?: number;
  } = {},
) {
  const tabs = over.tabs ?? ['review'];
  return render(
    <ViolationsPage
      communityId={1}
      tabs={tabs}
      initialTab={over.initialTab ?? tabs[0]!}
      canCreate
      finesEnabled={over.finesEnabled ?? true}
      hasArc
      initialUnitId={over.initialUnitId}
      mine={
        over.mine === undefined
          ? tabs.includes('mine')
            ? { residentUnitIds: [3], onYourUnit: [card(1)], yourReports: [card(2)] }
            : null
          : over.mine
      }
    />,
  );
}

function reviewReturns(data: ViolationItem[] | undefined, extra: Record<string, unknown> = {}) {
  useReviewMock.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: refetchMock,
    ...extra,
  });
}

function caseLinks() {
  return screen
    .queryAllByRole('link')
    .filter((a) => /^\/violations\/\d+\?/.test(a.getAttribute('href') ?? ''));
}

beforeEach(() => {
  vi.clearAllMocks();
  // Tab, ?reported= and ?unitId= changes use native history (the page need not re-render on the server).
  vi.spyOn(window.history, 'replaceState').mockImplementation(replaceMock);
  searchParamsRef.current = new URLSearchParams('communityId=1');
  reviewReturns(SIX);
});

describe('ViolationsPage — tabs', () => {
  it('draws no tablist for a single tab, and the Review panel shows open cases', () => {
    mount({ tabs: ['review'] });
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('open cases')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Violations' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New violation' })).toHaveAttribute(
      'href',
      '/violations/report?communityId=1',
    );
  });

  it('draws two tabs, and choosing Mine writes tab=mine with history.replaceState, not router.replace', async () => {
    const user = userEvent.setup();
    mount({ tabs: ['review', 'mine'] });
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    await user.click(screen.getByRole('tab', { name: 'Mine' }));
    expect(replaceMock).toHaveBeenCalledWith(null, '', expect.stringContaining('tab=mine'));
    expect(routerReplaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 2, name: 'On your unit' })).toBeVisible();
    expect(screen.queryByText('open cases')).toBeNull();
  });

  it('never asks for Review data when the viewer has no Review tab', () => {
    mount({ tabs: ['mine'] });
    expect(useReviewMock).toHaveBeenCalled();
    for (const call of useReviewMock.mock.calls) expect(call[2]).toBe(false);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('link', { name: 'Report a violation' })).toHaveAttribute(
      'href',
      '/violations/report?communityId=1',
    );
  });
});

describe('ViolationsPage — Review gate', () => {
  it('keeps Review data off even when asked to open on Review without the tab', () => {
    mount({ tabs: ['mine'], initialTab: 'review' });
    expect(useReviewMock).toHaveBeenCalled();
    for (const call of useReviewMock.mock.calls) expect(call[2]).toBe(false);
  });
});

describe('ViolationsPage — Review', () => {
  it('Reported filter leaves only reported rows, and its count matches the panel', () => {
    mount();
    expect(caseLinks()).toHaveLength(6);
    const reported = screen.getByRole('button', { name: /^Reported/ });
    expect(reported).toHaveTextContent('2');
    fireEvent.click(reported);
    expect(reported).toHaveAttribute('aria-pressed', 'true');
    expect(caseLinks().map((a) => a.textContent)).toEqual(['Parking · Unit 412', 'Noise · Unit 6']);
    const waiting = screen.getByText('Waiting for a notice');
    expect(waiting.nextElementSibling).toHaveTextContent('2');
  });

  it('has no Fined filter when fines are off, even with a fined row; the row still counts open', () => {
    reviewReturns([...SIX, item(11, { status: 'fined' })]);
    mount({ finesEnabled: false });
    expect(screen.queryByRole('button', { name: /^Fined/ })).toBeNull();
    expect(screen.getByText('open cases').previousElementSibling).toHaveTextContent('5');
  });

  it('has a Fined filter when fines are on', () => {
    mount({ finesEnabled: true });
    expect(screen.getByRole('button', { name: /^Fined/ })).toBeInTheDocument();
  });

  it('links a row to its case page and builds the meta line', () => {
    mount();
    const link = screen.getByRole('link', { name: 'Parking · Unit 412' });
    expect(link).toHaveAttribute('href', '/violations/5?communityId=1');
    const row = link.closest('li')!;
    expect(within(row).getByText('Case 5 first line')).toBeInTheDocument();
    expect(row).toHaveTextContent(/Reported · Major · Reported Nov 12, 2026/);
  });

  it('shows 20 rows, then all 25 after Load more', () => {
    reviewReturns(Array.from({ length: 25 }, (_, i) => item(i + 1)));
    mount();
    expect(caseLinks()).toHaveLength(20);
    expect(screen.getByText('Showing 20 of 25')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(caseLinks()).toHaveLength(25);
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('Try again refetches after an error', () => {
    reviewReturns(undefined, { isError: true });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks the list busy while loading', () => {
    reviewReturns(undefined, { isLoading: true });
    const { container } = mount();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('says nothing matches, and Clear filters brings the rows back', () => {
    reviewReturns(SIX.filter((v) => v.status !== 'dismissed'));
    mount();
    fireEvent.click(screen.getByRole('button', { name: /^Dismissed/ }));
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(caseLinks()).toHaveLength(5);
  });

  it('shows the first run when there are no cases at all', () => {
    reviewReturns([]);
    mount();
    expect(screen.getByRole('heading', { name: 'No violation cases yet' })).toBeInTheDocument();
  });

  it('keeps the date filters under their e2e labels and passes them to the walk', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Filter violations from date'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText('Filter violations until date'), {
      target: { value: '2026-11-30' },
    });
    const last = useReviewMock.mock.calls.at(-1)!;
    expect(last[1]).toMatchObject({ createdAfter: '2026-11-01', createdBefore: '2026-11-30' });
  });

  it('narrows to one unit and Show all units widens it', () => {
    reviewReturns([item(4)]);
    mount({ initialUnitId: 4 });
    expect(useReviewMock.mock.calls.at(-1)![1]).toMatchObject({ unitId: 4 });
    expect(screen.getByText(/Unit 4 only/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show all units' }));
    expect(useReviewMock.mock.calls.at(-1)![1].unitId).toBeUndefined();
  });

  it('Show all units drops ?unitId= from the URL, keeping the rest', () => {
    searchParamsRef.current = new URLSearchParams('communityId=1&unitId=4&tab=review');
    reviewReturns([item(4)]);
    mount({ initialUnitId: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Show all units' }));
    expect(replaceMock).toHaveBeenLastCalledWith(null, '', '/violations?communityId=1&tab=review');
  });

  it('Clear filters drops ?unitId= from the URL, keeping the rest', () => {
    searchParamsRef.current = new URLSearchParams('communityId=1&unitId=4&tab=review');
    // The unit has cases, none dismissed: choosing Dismissed leaves nothing to show.
    reviewReturns([item(4)]);
    mount({ initialUnitId: 4 });
    fireEvent.click(screen.getByRole('button', { name: /^Dismissed/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(useReviewMock.mock.calls.at(-1)![1].unitId).toBeUndefined();
    expect(replaceMock).toHaveBeenLastCalledWith(null, '', '/violations?communityId=1&tab=review');
  });

  it('Needs attention selects the Reported filter', () => {
    mount();
    expect(screen.getByText(/2 reported cases have no notice yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show reported cases' }));
    expect(screen.getByRole('button', { name: /^Reported/ })).toHaveAttribute('aria-pressed', 'true');
    expect(caseLinks()).toHaveLength(2);
  });
});

describe('ViolationsPage — Mine', () => {
  it('does not link a report about a unit that is not the viewer’s', () => {
    mount({
      tabs: ['mine'],
      mine: {
        residentUnitIds: [3],
        onYourUnit: [],
        yourReports: [
          card(20, { unitId: 9, unitLabel: 'Unit 9', category: 'pet' }),
          card(21, { unitId: 3, unitLabel: 'Unit 3', category: 'trash' }),
        ],
      },
    });
    expect(screen.getByText('Pet Violation · Unit 9')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pet Violation · Unit 9' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Trash / Debris · Unit 3' })).toHaveAttribute(
      'href',
      '/violations/21?communityId=1',
    );
    // One empty section is omitted.
    expect(screen.queryByRole('heading', { name: 'On your unit' })).toBeNull();
  });

  it('puts Filed by staff in the meta line', () => {
    mount({
      tabs: ['mine'],
      mine: { residentUnitIds: [3], onYourUnit: [card(1, { reportedByRole: 'staff' })], yourReports: [] },
    });
    expect(screen.getByRole('link', { name: 'Noise · Unit 3' }).closest('li')).toHaveTextContent(
      /Filed by staff/,
    );
  });

  it('shows the not-linked first run for a resident with no unit, with no header action', () => {
    mount({ tabs: ['mine'], mine: { residentUnitIds: [], onYourUnit: [], yourReports: [] } });
    expect(
      screen.getByRole('heading', { level: 2, name: "You're not linked to a unit yet" }),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Report a violation' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toBeInTheDocument();
  });

  it('shows Nothing here yet when both lists are empty, with one Report a violation button', () => {
    mount({ tabs: ['mine'], mine: { residentUnitIds: [3], onYourUnit: [], yourReports: [] } });
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing here yet' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Report a violation' })).toHaveLength(1);
  });
});

describe('ViolationsPage — confirmation', () => {
  it('shows the sent line for ?reported=42, strips the param, and dismisses', () => {
    searchParamsRef.current = new URLSearchParams('communityId=1&tab=mine&reported=42');
    mount({ tabs: ['mine'] });
    expect(screen.getByText('Report #42 sent to the board.')).toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith(null, '', '/violations?communityId=1&tab=mine');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Report #42 sent to the board.')).toBeNull();
  });
});

describe('ViolationsPage — axe', () => {
  it('Review has no axe violations', async () => {
    const { container } = mount({ tabs: ['review', 'mine'] });
    expect(caseLinks().length).toBeGreaterThan(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Mine has no axe violations', async () => {
    const { container } = mount({ tabs: ['review', 'mine'], initialTab: 'mine' });
    expect(screen.getByRole('heading', { name: 'Your reports' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
