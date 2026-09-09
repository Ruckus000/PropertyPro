// @vitest-environment jsdom
/**
 * Sign-out failure handling.
 *
 * supabase-js RESOLVES rather than throws when logout fails, and its `_signOut`
 * returns early — before clearing the local session — for any GoTrue failure
 * that is not a 401/403/404 (network error, 5xx, or a 429 from the logout rate
 * limit). An implementation that ignores the returned `{ error }` would leave a
 * live `sb-admin-auth-token` behind while navigating to `/auth/login`, which is
 * a public path in admin middleware — so the operator would be told they were
 * signed out while the session stayed valid, and the next person at a shared
 * workstation would inherit a privileged console session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const signOutMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('next/link', () => ({
  default: ({ children }: { children: unknown }) => children,
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ auth: { signOut: signOutMock } })),
}));

import { RailFooter } from '@/components/shell/RailFooter';

const user = { email: 'ops@getpropertypro.com', initial: 'O' };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let assignedHref: string | null;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  signOutMock.mockReset();
  assignedHref = null;

  // jsdom refuses real navigation; capture the assignment instead.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      get href() {
        return 'http://admin.getpropertypro.com/dashboard';
      },
      set href(value: string) {
        assignedHref = value;
      },
    },
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

async function renderAndClickSignOut() {
  await act(async () => {
    root.render(<RailFooter user={user} expanded />);
  });

  const button = Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Sign out'),
  );
  expect(button, 'sign-out button should render').toBeTruthy();

  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('RailFooter sign-out', () => {
  it('navigates to the login page when sign-out succeeds', async () => {
    signOutMock.mockResolvedValue({ error: null });

    await renderAndClickSignOut();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(assignedHref).toBe('/auth/login');
    expect(container.textContent).not.toContain('Sign out failed');
  });

  it('does NOT navigate when supabase returns an error, and says so', async () => {
    // The shape supabase-js actually returns on a 429/5xx/network failure:
    // a resolved promise carrying an error, not a throw.
    signOutMock.mockResolvedValue({
      error: { name: 'AuthApiError', status: 429, message: 'Too many requests' },
    });

    await renderAndClickSignOut();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(assignedHref).toBeNull();
    expect(container.textContent).toContain('Sign out failed');
    expect(container.querySelector('[role="alert"]')).toBeTruthy();
  });

  it('does NOT navigate when the client throws', async () => {
    signOutMock.mockRejectedValue(new Error('network down'));

    await renderAndClickSignOut();

    expect(assignedHref).toBeNull();
    expect(container.textContent).toContain('Sign out failed');
  });

  it('does NOT navigate when Supabase env vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    await renderAndClickSignOut();

    expect(signOutMock).not.toHaveBeenCalled();
    expect(assignedHref).toBeNull();
    expect(container.textContent).toContain('Sign out failed');
  });

  // Review finding (task 8): `expanded` on the rail is `pinned || hovered`,
  // NOT a persisted setting like the old sidebar's `collapsed` — it can flip
  // to false while a sign-out request is still in flight (the operator moved
  // the mouse away). The failure alert must not be gated on it, or the
  // operator loses the ONLY reliable signal that they are still signed in.
  // Renders with `expanded={false}` directly (not via `renderAndClickSignOut`,
  // which always passes `expanded`) so this exercises the collapsed-rail path.
  it('still surfaces the failure alert when the rail is collapsed (expanded=false)', async () => {
    signOutMock.mockResolvedValue({
      error: { name: 'AuthApiError', status: 429, message: 'Too many requests' },
    });

    await act(async () => {
      root.render(<RailFooter user={user} expanded={false} />);
    });

    const button = container.querySelector('button[aria-label="Sign out"]');
    expect(button, 'sign-out button should render').toBeTruthy();

    await act(async () => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(assignedHref).toBeNull();
    const alert = container.querySelector('[role="alert"]');
    expect(alert, 'the alert must still be present, not unmounted, when collapsed').toBeTruthy();
    expect(alert!.textContent).toContain('Sign out failed — you are still signed in. Try again.');
  });
});
