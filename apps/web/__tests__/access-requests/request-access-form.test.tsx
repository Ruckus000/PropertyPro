/**
 * Unit tests for RequestAccessForm (B5 batch #13 drain).
 *
 * Post-B5 drain: the form delegates the two POSTs to `useSubmitAccessRequest`
 * / `useVerifyAccessRequest`. The FormState machine stays component-driven
 * (the component explicitly calls setState('submitting'/'verifying')); these
 * tests mock the hooks with controllable mutations and assert the observable
 * behavior is unchanged.
 *
 * Tests cover:
 * - Invalid form (missing name / bad email) → field errors, submit NOT called
 * - Valid submit → submit mutate called with exact payload, advances to OTP
 * - OTP length ≠ 6 → otp field error, verify NOT called
 * - Valid verify → success state
 * - Submit reject → serverError shows the thrown message + back to idle
 * - Verify reject → serverError + back to otp_input
 * - Resend → re-invokes the submit path
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Radix Checkbox (shadcn) requires ResizeObserver in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const submitMutateAsync = vi.fn();
const verifyMutateAsync = vi.fn();

vi.mock('@/hooks/use-access-request-form', () => ({
  useSubmitAccessRequest: () => ({ mutateAsync: submitMutateAsync }),
  useVerifyAccessRequest: () => ({ mutateAsync: verifyMutateAsync }),
}));

import { RequestAccessForm } from '../../src/components/access-requests/request-access-form';

function renderForm() {
  return render(
    <RequestAccessForm
      communityId={42}
      communitySlug="sunset-condos"
      communityName="Sunset Condos"
      refCode="PROMO"
    />,
  );
}

// "Request access" / "Verify" appear in both the <h1> and the submit button;
// scope to the button role to disambiguate, then submit its <form>.
function submitRequestForm() {
  fireEvent.submit(
    screen.getByRole('button', { name: 'Request access' }).closest('form')!,
  );
}

function submitVerifyForm() {
  fireEvent.submit(
    screen.getByRole('button', { name: 'Verify' }).closest('form')!,
  );
}

function fillValid() {
  fireEvent.change(screen.getByLabelText(/Full name/), {
    target: { value: 'Jane Smith' },
  });
  fireEvent.change(screen.getByLabelText(/Email address/), {
    target: { value: 'jane@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/Unit number/), {
    target: { value: '4B' },
  });
}

describe('RequestAccessForm', () => {
  beforeEach(() => {
    submitMutateAsync.mockReset();
    verifyMutateAsync.mockReset();
  });

  it('shows field errors and does not call submit when form invalid', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Email address/), {
      target: { value: 'not-an-email' },
    });
    submitRequestForm();

    expect(screen.getByText('Full name is required.')).toBeDefined();
    expect(screen.getByText('Enter a valid email address.')).toBeDefined();
    expect(submitMutateAsync).not.toHaveBeenCalled();
  });

  it('submits with the exact payload and advances to the OTP step', async () => {
    submitMutateAsync.mockResolvedValue({ requestId: 99 });
    renderForm();
    fillValid();
    fireEvent.click(screen.getByLabelText('I am a unit owner'));
    submitRequestForm();

    await waitFor(() =>
      expect(screen.getByText('Verification code')).toBeDefined(),
    );

    expect(submitMutateAsync).toHaveBeenCalledTimes(1);
    expect(submitMutateAsync).toHaveBeenCalledWith({
      communityId: 42,
      communitySlug: 'sunset-condos',
      email: 'jane@example.com',
      fullName: 'Jane Smith',
      phone: undefined,
      claimedUnitNumber: '4B',
      isUnitOwner: true,
      refCode: 'PROMO',
    });
  });

  it('shows otp field error and does not call verify when code length ≠ 6', async () => {
    submitMutateAsync.mockResolvedValue({ requestId: 99 });
    renderForm();
    fillValid();
    submitRequestForm();
    await waitFor(() =>
      expect(screen.getByText('Verification code')).toBeDefined(),
    );

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123' },
    });
    submitVerifyForm();

    expect(
      screen.getByText('Enter the 6-digit code from your email.'),
    ).toBeDefined();
    expect(verifyMutateAsync).not.toHaveBeenCalled();
  });

  it('verifies a valid code and reaches the success state', async () => {
    submitMutateAsync.mockResolvedValue({ requestId: 99 });
    verifyMutateAsync.mockResolvedValue(undefined);
    renderForm();
    fillValid();
    submitRequestForm();
    await waitFor(() =>
      expect(screen.getByText('Verification code')).toBeDefined(),
    );

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    submitVerifyForm();

    await waitFor(() =>
      expect(
        screen.getByText('Your request has been submitted'),
      ).toBeDefined(),
    );
    expect(verifyMutateAsync).toHaveBeenCalledWith({
      requestId: 99,
      otp: '123456',
      communityId: 42,
    });
  });

  it('surfaces the thrown submit message and returns to idle on reject', async () => {
    submitMutateAsync.mockRejectedValue(new Error('Email already registered'));
    renderForm();
    fillValid();
    submitRequestForm();

    await waitFor(() =>
      expect(screen.getByText('Email already registered')).toBeDefined(),
    );
    // Back to idle: the idle form's submit button is rendered again.
    expect(
      screen.getByRole('button', { name: 'Request access' }),
    ).toBeDefined();
  });

  it('surfaces the thrown verify message and returns to otp_input on reject', async () => {
    submitMutateAsync.mockResolvedValue({ requestId: 99 });
    verifyMutateAsync.mockRejectedValue(new Error('Invalid or expired code'));
    renderForm();
    fillValid();
    submitRequestForm();
    await waitFor(() =>
      expect(screen.getByText('Verification code')).toBeDefined(),
    );

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    submitVerifyForm();

    await waitFor(() =>
      expect(screen.getByText('Invalid or expired code')).toBeDefined(),
    );
    // Back to otp_input: the verification-code field is still rendered.
    expect(screen.getByText('Verification code')).toBeDefined();
  });

  it('re-invokes the submit path when Resend code is clicked', async () => {
    submitMutateAsync.mockResolvedValue({ requestId: 99 });
    renderForm();
    fillValid();
    submitRequestForm();
    await waitFor(() =>
      expect(screen.getByText('Verification code')).toBeDefined(),
    );
    expect(submitMutateAsync).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Resend code'));

    await waitFor(() => expect(submitMutateAsync).toHaveBeenCalledTimes(2));
  });
});
