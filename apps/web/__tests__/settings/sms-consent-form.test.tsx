/**
 * Unit tests for SmsConsentForm (B5 batch #17 drain).
 *
 * Post-B5 split: the three /api/v1 fetches moved to use-phone-verification
 * (useSendPhoneVerification / useConfirmPhoneVerification / useSetSmsConsent).
 * The component still owns the entire step machine, loading/error/verified
 * state, and the per-step catch fallbacks. These tests mock the three
 * mutations and exercise the component's DOM behavior + error literals.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const sendMutateAsync = vi.fn();
const confirmMutateAsync = vi.fn();
const consentMutateAsync = vi.fn();

vi.mock('@/hooks/use-phone-verification', () => ({
  useSendPhoneVerification: () => ({ mutateAsync: sendMutateAsync }),
  useConfirmPhoneVerification: () => ({ mutateAsync: confirmMutateAsync }),
  useSetSmsConsent: () => ({ mutateAsync: consentMutateAsync }),
}));

import { SmsConsentForm } from '../../src/components/settings/sms-consent-form';

const baseProps = {
  communityId: 42,
  currentPhone: null as string | null,
  phoneVerified: false,
  smsEnabled: false,
  smsConsentGivenAt: null as string | null,
  onConsentChange: vi.fn(),
};

function renderForm(overrides: Partial<typeof baseProps> = {}) {
  return render(<SmsConsentForm {...baseProps} {...overrides} />);
}

beforeEach(() => {
  sendMutateAsync.mockReset();
  confirmMutateAsync.mockReset();
  consentMutateAsync.mockReset();
  baseProps.onConsentChange.mockReset();
});

describe('SmsConsentForm step machine', () => {
  it('starts at idle when phone not verified', () => {
    renderForm();
    expect(screen.getByText('Verify Phone Number')).toBeDefined();
  });

  it('starts at consent when phone is verified and present', () => {
    renderForm({ phoneVerified: true, currentPhone: '+13055551234' });
    expect(screen.getByText(/Phone verified:/)).toBeDefined();
  });

  it('idle → enter_phone on button click', () => {
    renderForm();
    fireEvent.click(screen.getByText('Verify Phone Number'));
    expect(screen.getByLabelText('Phone number (US)')).toBeDefined();
  });

  it('send success advances to verify_otp', async () => {
    sendMutateAsync.mockResolvedValue(undefined);
    renderForm();
    fireEvent.click(screen.getByText('Verify Phone Number'));
    fireEvent.change(screen.getByLabelText('Phone number (US)'), {
      target: { value: '+13055551234' },
    });
    fireEvent.click(screen.getByText('Send Verification Code'));

    await waitFor(() =>
      expect(screen.getByLabelText('Verification code')).toBeDefined(),
    );
    expect(sendMutateAsync).toHaveBeenCalledWith({ phone: '+13055551234' });
  });

  it('send error renders the thrown message', async () => {
    sendMutateAsync.mockRejectedValue(new Error('rate limited'));
    renderForm();
    fireEvent.click(screen.getByText('Verify Phone Number'));
    fireEvent.change(screen.getByLabelText('Phone number (US)'), {
      target: { value: '+13055551234' },
    });
    fireEvent.click(screen.getByText('Send Verification Code'));

    await waitFor(() => expect(screen.getByText('rate limited')).toBeDefined());
  });

  it('send non-Error rejection falls back to the send catch literal', async () => {
    sendMutateAsync.mockRejectedValue('boom');
    renderForm();
    fireEvent.click(screen.getByText('Verify Phone Number'));
    fireEvent.change(screen.getByLabelText('Phone number (US)'), {
      target: { value: '+13055551234' },
    });
    fireEvent.click(screen.getByText('Send Verification Code'));

    await waitFor(() =>
      expect(screen.getByText('Failed to send code')).toBeDefined(),
    );
  });

  it('confirm success advances to consent + verified', async () => {
    sendMutateAsync.mockResolvedValue(undefined);
    confirmMutateAsync.mockResolvedValue(undefined);
    renderForm();
    fireEvent.click(screen.getByText('Verify Phone Number'));
    fireEvent.change(screen.getByLabelText('Phone number (US)'), {
      target: { value: '+13055551234' },
    });
    fireEvent.click(screen.getByText('Send Verification Code'));
    await waitFor(() =>
      expect(screen.getByLabelText('Verification code')).toBeDefined(),
    );

    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByText('Verify'));

    await waitFor(() =>
      expect(screen.getByText(/Phone verified:/)).toBeDefined(),
    );
    expect(confirmMutateAsync).toHaveBeenCalledWith({
      phone: '+13055551234',
      code: '123456',
    });
  });

  it('confirm error renders the thrown message', async () => {
    sendMutateAsync.mockResolvedValue(undefined);
    confirmMutateAsync.mockRejectedValue(new Error('bad code'));
    renderForm();
    fireEvent.click(screen.getByText('Verify Phone Number'));
    fireEvent.change(screen.getByLabelText('Phone number (US)'), {
      target: { value: '+13055551234' },
    });
    fireEvent.click(screen.getByText('Send Verification Code'));
    await waitFor(() =>
      expect(screen.getByLabelText('Verification code')).toBeDefined(),
    );
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByText('Verify'));

    await waitFor(() => expect(screen.getByText('bad code')).toBeDefined());
  });

  it('confirm non-Error rejection falls back to the confirm catch literal', async () => {
    sendMutateAsync.mockResolvedValue(undefined);
    confirmMutateAsync.mockRejectedValue('nope');
    renderForm();
    fireEvent.click(screen.getByText('Verify Phone Number'));
    fireEvent.change(screen.getByLabelText('Phone number (US)'), {
      target: { value: '+13055551234' },
    });
    fireEvent.click(screen.getByText('Send Verification Code'));
    await waitFor(() =>
      expect(screen.getByLabelText('Verification code')).toBeDefined(),
    );
    fireEvent.change(screen.getByLabelText('Verification code'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByText('Verify'));

    await waitFor(() =>
      expect(screen.getByText('Verification failed')).toBeDefined(),
    );
  });

  it('consent toggle success calls onConsentChange', async () => {
    consentMutateAsync.mockResolvedValue(undefined);
    renderForm({ phoneVerified: true, currentPhone: '+13055551234' });

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(() =>
      expect(baseProps.onConsentChange).toHaveBeenCalledWith(true),
    );
    expect(consentMutateAsync).toHaveBeenCalledWith({
      communityId: 42,
      smsEnabled: true,
    });
  });

  it('consent toggle error renders the SMS preferences literal', async () => {
    consentMutateAsync.mockRejectedValue(
      new Error('Failed to update SMS preferences'),
    );
    renderForm({ phoneVerified: true, currentPhone: '+13055551234' });

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(() =>
      expect(
        screen.getByText('Failed to update SMS preferences'),
      ).toBeDefined(),
    );
  });

  it('consent toggle non-Error rejection falls back to "Failed to update"', async () => {
    consentMutateAsync.mockRejectedValue('x');
    renderForm({ phoneVerified: true, currentPhone: '+13055551234' });

    fireEvent.click(screen.getByRole('checkbox'));

    await waitFor(() =>
      expect(screen.getByText('Failed to update')).toBeDefined(),
    );
  });
});
