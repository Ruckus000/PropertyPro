/**
 * Move-in/out screens print the unit's NUMBER ("Unit 1B"), the `unitLabel` the
 * list and detail GETs attach, not its database id (unitId 2 here).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { CHECKLIST } = vi.hoisted(() => ({
  CHECKLIST: {
    id: 5,
    communityId: 42,
    leaseId: 9,
    unitId: 2,
    unitLabel: 'Unit 1B',
    residentId: 'resident-1',
    type: 'move_in' as const,
    checklistData: {},
    completedAt: null,
    completedBy: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
}));

const nav = vi.hoisted(() => ({ search: 'communityId=42' }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/move-in-out',
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock('@/hooks/use-move-checklists', () => ({
  useMoveChecklists: () => ({ data: [CHECKLIST], isLoading: false }),
  useMoveChecklist: () => ({ data: CHECKLIST, isLoading: false }),
  useUpdateChecklistStep: () => ({ mutate: vi.fn(), isPending: false }),
  useTriggerStepAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ChecklistListPage } from '@/components/move-checklists/ChecklistListPage';

describe('move checklist unit label', () => {
  it('list card and open checklist show the unit number, not the unit id', () => {
    const list = render(<ChecklistListPage communityId={42} />);

    expect(screen.getByRole('link', { name: 'Unit 1B — Lease #9' })).toBeInTheDocument();
    expect(screen.queryByText(/Unit #?2\b/)).not.toBeInTheDocument();
    list.unmount();

    // The open checklist, at its address.
    nav.search = 'communityId=42&checklist=5';
    render(<ChecklistListPage communityId={42} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Move-in checklist' })).toBeInTheDocument();
    expect(screen.getByText('Unit 1B — Lease #9')).toBeInTheDocument();
    expect(screen.queryByText(/Unit #?2\b/)).not.toBeInTheDocument();
  });
});
