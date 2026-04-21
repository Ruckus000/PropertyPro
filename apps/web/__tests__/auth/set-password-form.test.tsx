import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signInWithPasswordMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
}));

vi.mock('@propertypro/db/supabase/client', () => ({
  createBrowserClient: () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
    },
  }),
}));

import { SetPasswordForm } from '../../src/components/auth/set-password-form';

describe('SetPasswordForm', () => {
  beforeEach(() => {
    signInWithPasswordMock.mockReset();
    signInWithPasswordMock.mockResolvedValue({ error: null });
  });

  it('clears stale password validation errors when the password changes', async () => {
    render(<SetPasswordForm token="invite-token" communityId={1} />);
    const form = screen.getByTestId('set-password-form');

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abcdefgh' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'abcdefgh' } });

    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByTestId('set-password-error')).toHaveTextContent('Password must include an uppercase letter');
    });

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Abcdefg1!' } });

    await waitFor(() => {
      expect(screen.queryByTestId('set-password-error')).toBeNull();
    });
  });
});
