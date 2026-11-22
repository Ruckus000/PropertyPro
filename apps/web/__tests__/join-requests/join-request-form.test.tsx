/**
 * Unit tests for JoinRequestForm (B5 drain #20).
 *
 * Post-drain: the form's POST /api/v1/account/join-requests call lives in the
 * `useCreateJoinRequest` hook. These tests mock that hook (the data boundary)
 * and assert the form's wiring + preserved UI literals.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mutateMock = vi.fn();
const useCreateJoinRequestMock = vi.fn();

vi.mock('@/hooks/use-join-requests', () => ({
  useCreateJoinRequest: () => useCreateJoinRequestMock(),
}));

import { JoinRequestForm } from '../../src/components/join-requests/join-request-form';

interface MutationState {
  isPending?: boolean;
  error?: Error | null;
}

function setMutation(state: MutationState = {}) {
  useCreateJoinRequestMock.mockReturnValue({
    mutate: mutateMock,
    isPending: state.isPending ?? false,
    error: state.error ?? null,
  });
}

function renderForm(overrides?: {
  onDone?: () => void;
  onBack?: () => void;
  communityType?: string;
}) {
  const onDone = overrides?.onDone ?? vi.fn();
  const onBack = overrides?.onBack ?? vi.fn();
  render(
    <JoinRequestForm
      communityId={7}
      communityName="Sunset Condos"
      communityType={overrides?.communityType}
      onDone={onDone}
      onBack={onBack}
    />,
  );
  return { onDone, onBack };
}

describe('JoinRequestForm', () => {
  beforeEach(() => {
    mutateMock.mockReset();
    useCreateJoinRequestMock.mockReset();
  });

  it('disables Submit until a unit identifier is entered', () => {
    setMutation();
    renderForm();
    const submitBtn = screen.getByRole('button', { name: 'Submit Request' });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Unit identifier/), {
      target: { value: '  Unit 12  ' },
    });
    expect(submitBtn).not.toBeDisabled();
  });

  it('submits the trimmed unit + selected resident type and wires onSuccess', () => {
    setMutation();
    const { onDone } = renderForm();

    fireEvent.change(screen.getByLabelText(/Unit identifier/), {
      target: { value: '  Lot 9  ' },
    });
    fireEvent.change(screen.getByLabelText(/I am a/), {
      target: { value: 'tenant' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

    expect(mutateMock).toHaveBeenCalledWith(
      { communityId: 7, unitIdentifier: 'Lot 9', residentType: 'tenant' },
      { onSuccess: onDone },
    );
  });

  it('shows the pending label and disables Back while submitting', () => {
    setMutation({ isPending: true });
    renderForm();

    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('renders the error AlertBanner with the thrown message', () => {
    setMutation({
      error: new Error("You're already a member of this community."),
    });
    renderForm();

    expect(screen.getByText('Request could not be submitted')).toBeDefined();
    expect(
      screen.getByText("You're already a member of this community."),
    ).toBeDefined();
  });

  // D12: an apartment has no unit owners, so a request to one is tenant-only.
  it('offers no Owner choice for an apartment and submits as a tenant', () => {
    setMutation();
    const { onDone } = renderForm({ communityType: 'apartment' });

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('option', { name: 'Owner' })).toBeNull();
    expect(screen.getByText('Apartment communities accept tenant requests only.')).toBeDefined();

    fireEvent.change(screen.getByLabelText(/Unit identifier/), {
      target: { value: 'Apt 3B' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));

    expect(mutateMock).toHaveBeenCalledWith(
      { communityId: 7, unitIdentifier: 'Apt 3B', residentType: 'tenant' },
      { onSuccess: onDone },
    );
  });

  it('control: a condo keeps the Owner/Tenant choice, defaulting to Owner', () => {
    setMutation();
    renderForm({ communityType: 'condo_718' });

    expect(screen.getByRole('option', { name: 'Owner' })).toBeDefined();
    expect((screen.getByLabelText(/I am a/) as HTMLSelectElement).value).toBe('owner');
  });

  it('invokes onBack when Back is clicked', () => {
    setMutation();
    const { onBack } = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });
});
