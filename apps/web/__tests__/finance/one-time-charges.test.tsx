/// <reference types="@testing-library/jest-dom" />
/**
 * Generate charges for a One-Time assessment: nothing is charged until the
 * manager picks a due date and confirms.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { Assessment } from '@/hooks/use-finance';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('@/hooks/use-finance', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-finance')>('@/hooks/use-finance');
  return { ...actual, useGenerateAssessmentLineItems: () => ({ mutateAsync, isPending: false }) };
});

import { OneTimeCharges } from '@/components/finance/one-time-charges';

const ROOF: Assessment = {
  id: 7,
  communityId: 42,
  title: 'Roof Special',
  description: null,
  amountCents: 120000,
  frequency: 'one_time',
  dueDay: null,
  lateFeeAmountCents: 0,
  lateFeeDaysGrace: 15,
  startDate: '2026-11-20',
  endDate: null,
  isActive: true,
  createdAt: '2026-11-20T00:00:00Z',
};

function renderCharges(assessment: Assessment = ROOF) {
  return render(<OneTimeCharges communityId={42} assessment={assessment} today="2026-11-20" />);
}

function pickDate(value: string) {
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value } });
}

describe('<OneTimeCharges>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({ insertedCount: 12, skippedCount: 0, dueDate: '2026-12-01' });
  });

  it('asks for a due date before anything else', () => {
    renderCharges();
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));
    expect(screen.getByText('Choose a due date.')).toBeInTheDocument();
    expect(screen.getByLabelText('Due date')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('refuses a date before today', () => {
    renderCharges();
    pickDate('2026-11-19');
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));
    expect(screen.getByText('Choose today or a later date.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('charges only after the manager confirms, with the date they picked', async () => {
    renderCharges();
    pickDate('2026-12-01');
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));

    const dialog = await screen.findByRole('alertdialog', { name: 'Charge every unit $1,200.00?' });
    expect(dialog).toHaveTextContent('for Roof Special, due Dec 1, 2026');
    expect(dialog).toHaveTextContent('can’t be removed');
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate charges' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('2026-12-01'));
  });

  it('charges nothing when the manager goes back', async () => {
    renderCharges();
    pickDate('2026-12-01');
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('says so when the server refuses', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Cannot generate line items: no units found for this community'));
    renderCharges();
    pickDate('2026-12-01');
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate charges' }));
    expect(await screen.findByText('Cannot generate line items: no units found for this community')).toBeInTheDocument();
    expect(screen.getByText('No charges were created')).toBeInTheDocument();
  });

  it('an inactive assessment says how to charge it, with no button', () => {
    renderCharges({ ...ROOF, isActive: false });
    expect(screen.getByText('This assessment is inactive. To charge it, select Edit and turn on Active.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate charges' })).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderCharges();
    expect(screen.getByLabelText('Due date')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
