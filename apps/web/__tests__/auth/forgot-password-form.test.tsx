import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requestPasswordResetMock } = vi.hoisted(() => ({
  requestPasswordResetMock: vi.fn(),
}));

vi.mock('@/lib/auth/actions', () => ({
  requestPasswordReset: requestPasswordResetMock,
}));

import { ForgotPasswordForm } from '../../src/components/auth/forgot-password-form';

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    requestPasswordResetMock.mockReset();
  });

  it('clears stale validation errors when the email changes', async () => {
    const { container } = render(<ForgotPasswordForm />);
    const form = container.querySelector('form');

    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Forgot password form not found');
    }

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'invalid-email' } });
    fireEvent.submit(form);

    expect(screen.getByTestId('forgot-password-error')).toHaveTextContent('Please enter a valid email address');

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'user@example.com' } });

    await waitFor(() => {
      expect(screen.queryByTestId('forgot-password-error')).toBeNull();
    });
  });
});
