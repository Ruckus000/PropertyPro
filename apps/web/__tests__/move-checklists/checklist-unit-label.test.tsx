/**
 * Move-in/out screens print the unit's NUMBER ("Unit 1B"), the `unitLabel` the
 * list and detail GETs attach, not its database id (unitId 2 here).
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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

vi.mock('@/hooks/use-move-checklists', () => ({
  useMoveChecklists: () => ({ data: [CHECKLIST], isLoading: false }),
  useMoveChecklist: () => ({ data: CHECKLIST, isLoading: false }),
  useUpdateChecklistStep: () => ({ mutate: vi.fn(), isPending: false }),
  useTriggerStepAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ChecklistListPage } from '@/components/move-checklists/ChecklistListPage';

describe('move checklist unit label', () => {
  it('list card and detail header show the unit number, not the unit id', () => {
    render(<ChecklistListPage communityId={42} />);

    expect(screen.getByText(/Unit 1B — Lease #9/)).toBeInTheDocument();
    expect(screen.queryByText(/Unit #?2 — /)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Unit 1B/ }));

    expect(screen.getByText(/Unit 1B — Lease #9 —/)).toBeInTheDocument();
    expect(screen.queryByText(/Unit #?2 — /)).not.toBeInTheDocument();
  });
});
