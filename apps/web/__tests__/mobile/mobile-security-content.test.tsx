/**
 * MobileSecurityContent — the mobile Security page's password change and
 * "Forgot your password?" link.
 *
 * - Forgot-password goes through the `requestPasswordReset` server action, as
 *   /auth/forgot-password does: it sets the /auth/reset-password redirect, rate
 *   limits, and refuses under a support session. The old bare client call
 *   `resetPasswordForEmail(email)` set no redirect at all.
 * - Change-password validates against the shared policy, not a bare length
 *   check, so a password the server will reject is caught with the real reason.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const { requestPasswordResetMock, signInMock, updateUserMock, resetForEmailMock } = vi.hoisted(
  () => ({
    requestPasswordResetMock: vi.fn(),
    signInMock: vi.fn(),
    updateUserMock: vi.fn(),
    resetForEmailMock: vi.fn(),
  }),
);

vi.mock('@/lib/auth/actions', () => ({
  requestPasswordReset: requestPasswordResetMock,
}));
vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: {
      signInWithPassword: signInMock,
      updateUser: updateUserMock,
      resetPasswordForEmail: resetForEmailMock,
    },
  }),
}));
vi.mock('@/components/motion', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
  SlideUp: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/mobile/MobileBackHeader', () => ({
  MobileBackHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { MobileSecurityContent } from '../../src/components/mobile/MobileSecurityContent';

function fillPasswords(next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'Old!pass1' } });
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: /Update Password/ }));
}

describe('MobileSecurityContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInMock.mockResolvedValue({ error: null });
    updateUserMock.mockResolvedValue({ error: null });
  });

  describe('forgot password', () => {
    it('sends the reset through the server action, never the bare client call', async () => {
      requestPasswordResetMock.mockResolvedValue({ success: true, message: 'sent' });
      render(<MobileSecurityContent email="jane@example.com" communityId={42} />);

      fireEvent.click(screen.getByRole('button', { name: /Forgot your password/ }));

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Reset link sent to jane@example.com'),
      );
      expect(requestPasswordResetMock).toHaveBeenCalledWith('jane@example.com');
      expect(resetForEmailMock).not.toHaveBeenCalled();
    });

    it("shows the action's message when it refuses (rate limit)", async () => {
      requestPasswordResetMock.mockResolvedValue({
        success: false,
        message: 'Too many reset requests. Please try again later.',
      });
      render(<MobileSecurityContent email="jane@example.com" communityId={42} />);

      fireEvent.click(screen.getByRole('button', { name: /Forgot your password/ }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Too many reset requests. Please try again later.',
        ),
      );
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('shows a retry message when the action throws (e.g. support-session refusal)', async () => {
      requestPasswordResetMock.mockRejectedValue(new Error('Not available during a support session'));
      render(<MobileSecurityContent email="jane@example.com" communityId={42} />);

      fireEvent.click(screen.getByRole('button', { name: /Forgot your password/ }));

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          "Couldn't send the reset link. Please try again.",
        ),
      );
      expect(screen.queryByRole('status')).toBeNull();
    });
  });

  describe('change password', () => {
    it('rejects a password the shared policy refuses, before touching Supabase', async () => {
      render(<MobileSecurityContent email="jane@example.com" communityId={42} />);

      // 8+ characters, so the old length-only check let it through.
      fillPasswords('abcdefgh');

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Password must include an uppercase letter',
      );
      expect(signInMock).not.toHaveBeenCalled();
      expect(updateUserMock).not.toHaveBeenCalled();
    });

    it('updates a password that meets the policy', async () => {
      render(<MobileSecurityContent email="jane@example.com" communityId={42} />);

      fillPasswords('Secure!123');

      await waitFor(() =>
        expect(screen.getByRole('status')).toHaveTextContent('Password updated successfully'),
      );
      expect(signInMock).toHaveBeenCalledWith({ email: 'jane@example.com', password: 'Old!pass1' });
      expect(updateUserMock).toHaveBeenCalledWith({ password: 'Secure!123' });
    });

    it('still reports a mismatched confirmation', async () => {
      render(<MobileSecurityContent email="jane@example.com" communityId={42} />);

      fillPasswords('Secure!123', 'Secure!124');

      expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match');
      expect(updateUserMock).not.toHaveBeenCalled();
    });
  });
});
