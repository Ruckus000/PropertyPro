/**
 * One violation case on the page kit. Status and severity sit beside the
 * title as a glyph with its word; managers and board seats get the actions and
 * the Details panel; a resident gets neither, and is never told who reported.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerMock = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));

// The mocked router finishes its refresh at once, so "still refreshing" is
// set by hand: `transition.pending` is what useTransition reports.
const transition = vi.hoisted(() => ({ pending: false }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useTransition = () => [transition.pending, (fn: () => void) => fn()] as const;
  return { ...actual, default: { ...actual, useTransition }, useTransition };
});

// The transition form has its own test file; here it is two buttons.
vi.mock('@/components/violations/ViolationStatusTransition', () => ({
  ViolationStatusTransition: (props: { action: string; onComplete: () => void; onCancel: () => void }) => (
    <div data-testid="transition-form" data-action={props.action}>
      <button type="button" onClick={props.onComplete}>
        stub complete
      </button>
      <button type="button" onClick={props.onCancel}>
        stub cancel
      </button>
    </div>
  ),
}));

import { ViolationDetailView } from '@/components/violations/ViolationDetailView';
import type { ViolationRecord } from '@/lib/services/violations-service';

function violation(overrides: Partial<ViolationRecord> = {}): ViolationRecord {
  return {
    id: 12,
    communityId: 42,
    unitId: 101,
    unitLabel: 'Unit 1B',
    reportedByUserId: 'neighbour-1',
    category: 'noise',
    description: 'Loud music after midnight.',
    status: 'noticed',
    severity: 'major',
    evidenceDocumentIds: [],
    noticeDate: '2026-03-20',
    hearingDate: null,
    hearingLocation: null,
    resolutionDate: null,
    resolutionNotes: null,
    // Midday UTC, so the printed day is the same in any test time zone.
    createdAt: new Date('2026-03-18T16:00:00.000Z'),
    updatedAt: new Date('2026-03-20T16:00:00.000Z'),
    ...overrides,
  };
}

type Props = React.ComponentProps<typeof ViolationDetailView>;

function renderView(props: Partial<Props> = {}) {
  return render(
    <ViolationDetailView
      violation={violation()}
      communityId={42}
      communityTimezone="America/New_York"
      userId="manager-1"
      canManage
      finesEnabled
      reportedByRole="resident"
      {...props}
    />,
  );
}

function header() {
  return document.querySelector<HTMLElement>('[data-page-header]')!;
}

beforeEach(() => {
  vi.clearAllMocks();
  transition.pending = false;
});

describe('ViolationDetailView', () => {
  it('is a detail page whose title carries the status and severity words', () => {
    renderView();

    expect(document.querySelector('[data-page-template="detail"]')).not.toBeNull();
    const h1 = within(header()).getByRole('heading', { level: 1, name: 'Violation #12' });
    // Beside the title: the same row as the <h1>, not the actions slot.
    const titleRow = h1.parentElement!;
    expect(within(titleRow).getByText('Noticed')).toBeVisible();
    expect(within(titleRow).getByText('Major severity')).toBeVisible();
    expect(within(titleRow).queryByRole('button')).toBeNull();
  });

  it('uses the shared vocabulary for the status word', () => {
    renderView({ violation: violation({ status: 'hearing_scheduled' }) });
    // vocabulary.ts says "Hearing scheduled"; the old local map said "Hearing Scheduled".
    expect(within(header()).getByText('Hearing scheduled')).toBeVisible();
  });

  it('gives a manager the actions, with at most one filled primary', () => {
    renderView({ violation: violation({ status: 'hearing_scheduled' }) });

    const names = within(header())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(['Impose Fine', 'Dismiss', 'Resolve']);
    const filled = within(header())
      .getAllByRole('button')
      .filter((b) => b.className.split(/\s+/).includes('bg-interactive'));
    expect(filled.map((b) => b.textContent)).toEqual(['Resolve']);
  });

  it('gives a resident no actions', () => {
    renderView({ canManage: false, userId: 'household-1', reportedByRole: null });

    expect(within(header()).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule Hearing' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Impose Fine' })).toBeNull();
  });

  it('gives a resident no side panel, and the unit in the main column instead', () => {
    renderView({ canManage: false, userId: 'household-1', reportedByRole: null });

    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Details')).toBeNull();
    expect(screen.getByText('Noise · Unit 1B')).toBeVisible();
  });

  it('never tells a resident who reported, even if a reporter were passed', () => {
    // The route redacts the reporter for a resident; this is the second lock.
    renderView({ canManage: false, userId: 'household-1', reportedByRole: 'resident' });

    expect(screen.queryByText('Reported by')).toBeNull();
    expect(screen.queryByText('A resident')).toBeNull();
  });

  it('gives a manager the Details panel with the unit and the reporter', () => {
    renderView();

    const panel = screen.getByRole('complementary', { name: 'Summary' });
    expect(within(panel).getByText('Details')).toBeVisible();
    expect(within(panel).getByText('Unit 1B')).toBeVisible();
    expect(within(panel).getByText('Noise')).toBeVisible();
    expect(within(panel).getByText('Reported by').nextElementSibling).toHaveTextContent('A resident');
  });

  it('says "You" when the viewer filed the report, and "Staff" for a staff filing', () => {
    const { unmount } = renderView({ violation: violation({ reportedByUserId: 'manager-1' }), reportedByRole: 'staff' });
    expect(screen.getByText('Reported by').nextElementSibling).toHaveTextContent('You');
    unmount();

    renderView({ reportedByRole: 'staff' });
    expect(screen.getByText('Reported by').nextElementSibling).toHaveTextContent('Staff');
  });

  it('leaves the reporter line out when the reporter is unknown', () => {
    renderView({ violation: violation({ reportedByUserId: null }), reportedByRole: null });
    expect(screen.queryByText('Reported by')).toBeNull();
  });

  it('offers Impose Fine only when fines are enabled for the community', () => {
    const { unmount } = renderView({ finesEnabled: true });
    expect(screen.getByRole('button', { name: 'Impose Fine' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Schedule Hearing' })).toBeVisible();
    unmount();

    renderView({ finesEnabled: false });
    expect(screen.queryByRole('button', { name: 'Impose Fine' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Schedule Hearing' })).toBeVisible();
  });

  it('offers no actions on a closed case', () => {
    renderView({ violation: violation({ status: 'resolved' }) });
    expect(within(header()).queryByRole('button')).toBeNull();
  });

  it('opens the form for the chosen action and puts the header buttons away', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Hearing' }));

    expect(screen.getByTestId('transition-form')).toHaveAttribute('data-action', 'hearing');
    expect(screen.queryByRole('button', { name: 'Schedule Hearing' })).toBeNull();
    // Focus follows the form, not <body>, now that the button is gone.
    expect(screen.getByTestId('transition-form').parentElement).toHaveFocus();
  });

  it('refreshes the server-rendered case after a completed action, and closes the form', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Hearing' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub complete' }));

    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('transition-form')).toBeNull();
  });

  it('moves focus to the page title after a completed action', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Hearing' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub complete' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it("disables the old status's actions until the refreshed case arrives", () => {
    transition.pending = true;
    renderView();

    const buttons = within(header()).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Impose Fine', 'Schedule Hearing']);
    for (const button of buttons) expect(button).toBeDisabled();
  });

  it('enables the actions when no refresh is under way', () => {
    renderView();
    for (const button of within(header()).getAllByRole('button')) expect(button).toBeEnabled();
  });

  it('returns focus to the button that opened the form on cancel, without a refresh', () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Hearing' }));
    fireEvent.click(screen.getByRole('button', { name: 'stub cancel' }));

    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(screen.queryByTestId('transition-form')).toBeNull();
    expect(screen.getByRole('button', { name: 'Schedule Hearing' })).toHaveFocus();
  });

  it('lays out Description, Timeline, Resolution notes and Evidence in the main column', () => {
    renderView({
      violation: violation({
        status: 'resolved',
        resolutionDate: new Date('2026-04-02T16:00:00.000Z'),
        resolutionNotes: '<p>Owner complied.</p><img src="x" onerror="alert(1)">',
        hearingDate: new Date('2026-04-01T22:00:00.000Z'),
        hearingLocation: 'Clubhouse',
        evidenceDocumentIds: [7, 9],
      }),
    });

    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(
      expect.arrayContaining(['Description', 'Timeline', 'Resolution notes', 'Evidence']),
    );
    expect(screen.getByText('Loud music after midnight.')).toBeVisible();
    // The hearing is read in the community's clock (EDT), not the runner's.
    expect(screen.getByText('Wed, Apr 1, 2026 · 6:00 PM')).toBeVisible();
    expect(screen.getByText('Clubhouse')).toBeVisible();
    expect(screen.getByText('Owner complied.')).toBeVisible();
    expect(document.querySelector('img')).not.toHaveAttribute('onerror');
    expect(screen.getByText('2 documents on file (document IDs 7, 9).')).toBeVisible();
  });

  it('titles the notes "Dismissal reason" on a dismissed case and omits empty sections', () => {
    renderView({ violation: violation({ status: 'dismissed', resolutionNotes: '<p>Not a violation.</p>' }) });

    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toContain('Dismissal reason');
    expect(titles).not.toContain('Evidence');
  });
});
