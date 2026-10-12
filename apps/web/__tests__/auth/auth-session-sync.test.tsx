import { render } from '@testing-library/react';
import type { AuthChangeEvent } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshMock, onAuthStateChangeMock, pathnameState } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  pathnameState: { value: '/dashboard' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerStub,
  usePathname: () => pathnameState.value,
}));
// One stable router object, like Next's, so the effect's deps do not churn.
const routerStub = { refresh: refreshMock };

vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({ auth: { onAuthStateChange: onAuthStateChangeMock } }),
}));

import { AuthSessionSync } from '@/components/auth/auth-session-sync';

type Listener = (event: AuthChangeEvent, session: null) => void;

function lastListener(): Listener {
  return onAuthStateChangeMock.mock.calls.at(-1)![0] as Listener;
}

beforeEach(() => {
  refreshMock.mockReset();
  onAuthStateChangeMock.mockReset();
  onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  pathnameState.value = '/dashboard';
});

describe('AuthSessionSync', () => {
  it('does not refresh the router on a token refresh — same identity, middleware owns the cookies', () => {
    render(<AuthSessionSync />);
    const listener = lastListener();
    listener('INITIAL_SESSION', null);
    listener('TOKEN_REFRESHED', null);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('still refreshes when the user changes', () => {
    render(<AuthSessionSync />);
    const listener = lastListener();
    listener('INITIAL_SESSION', null);
    listener('USER_UPDATED', null);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('keeps one auth subscription across navigations', () => {
    const { rerender } = render(<AuthSessionSync />);
    pathnameState.value = '/announcements';
    rerender(<AuthSessionSync />);
    expect(onAuthStateChangeMock).toHaveBeenCalledTimes(1);
  });
});
