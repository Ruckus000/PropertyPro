/// <reference types="@testing-library/jest-dom" />
/**
 * Generate charges for a One-Time assessment: nothing is charged until the
 * manager picks a due date and confirms.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import type { Assessment } from '@/hooks/use-finance';
import { ApiRequestError } from '@/lib/api/request-json';

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

const onCharged = vi.fn();

function renderCharges(assessment: Assessment = ROOF) {
  return render(
    <OneTimeCharges communityId={42} assessment={assessment} timeZone="Pacific/Honolulu" onCharged={onCharged} />,
  );
}

function pickDate(value: string) {
  fireEvent.change(screen.getByLabelText('Due date'), { target: { value } });
}

describe('<OneTimeCharges>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 10pm on Nov 20 at the community, already Nov 21 in UTC and on the US
    // mainland. Honolulu so the test machine's own zone can never agree with it.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T08:00:00.000Z'));
    mutateAsync.mockResolvedValue({ insertedCount: 12, skippedCount: 0, dueDate: '2026-12-01' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks for a due date before anything else', () => {
    renderCharges();
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));
    expect(screen.getByText('Choose a due date.')).toBeInTheDocument();
    expect(screen.getByLabelText('Due date')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('takes today from the community, not the viewer’s clock', async () => {
    renderCharges();
    expect(screen.getByLabelText('Due date')).toHaveAttribute('min', '2026-11-20');
    pickDate('2026-11-20');
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('due Nov 20, 2026');
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
    // The form unmounts once the charges load; the parent moves focus.
    await waitFor(() => expect(onCharged).toHaveBeenCalledTimes(1));
  });

  it('charges nothing when the manager goes back', async () => {
    renderCharges();
    pickDate('2026-12-01');
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  async function confirmWith(failure: unknown) {
    mutateAsync.mockRejectedValueOnce(failure);
    renderCharges();
    pickDate('2026-12-01');
    fireEvent.click(screen.getByRole('button', { name: 'Generate charges' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate charges' }));
  }

  it('gives the server’s reason when it refuses', async () => {
    const reason = 'Your Directory has no units yet. Add units, then generate charges.';
    await confirmWith(new ApiRequestError(reason, { status: 422, code: 'UNPROCESSABLE_ENTITY' }));
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(screen.getByText('No charges were created')).toBeInTheDocument();
    expect(onCharged).not.toHaveBeenCalled();
  });

  it('asks a signed-out manager to sign in, not "Request failed"', async () => {
    await confirmWith(new ApiRequestError('Request failed', { status: 401 }));
    expect(await screen.findByText('Your session has ended. Sign in again, then generate the charges.')).toBeInTheDocument();
    expect(screen.queryByText('Request failed')).toBeNull();
  });

  it.each([
    ['a dropped connection', new TypeError('Load failed')],
    ['a server error', new ApiRequestError('An unexpected error occurred', { status: 500, code: 'INTERNAL_ERROR' })],
  ])('does not claim nothing was charged after %s', async (_label, failure) => {
    await confirmWith(failure);
    expect(await screen.findByText('We couldn’t confirm the charges')).toBeInTheDocument();
    expect(screen.queryByText('No charges were created')).toBeNull();
    expect(screen.queryByText((failure as Error).message)).toBeNull();
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
