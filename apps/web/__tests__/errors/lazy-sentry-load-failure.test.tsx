// @vitest-environment jsdom
/**
 * The error boundaries load the Sentry SDK on demand (a static import put the
 * whole SDK in every route's first load). If that chunk fails to load — a
 * deploy rotated it away, the network dropped — the dynamic import rejects.
 * Without a `.catch`, that rejection escaped as an anonymous "Uncaught (in
 * promise)": a second error thrown from inside the code handling the first.
 *
 * A `.catch` cannot deliver the lost report (there is no SDK to deliver it), so
 * what is asserted is the honest part: nothing escapes unhandled, and the
 * failure is logged under a recognisable label. Vitest fails the run on an
 * unhandled rejection, which is what makes each case non-vacuous.
 */
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => {
  throw new Error('Loading chunk sentry failed');
});
vi.mock('@/lib/supabase/client', () => ({
  createBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

import RootError from '../../src/app/error';
import GlobalError from '../../src/app/global-error';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

function sentryLoadFailureLogged(): boolean {
  return consoleError.mock.calls.some(
    ([first]) => typeof first === 'string' && first.startsWith('[Sentry]'),
  );
}

describe('a failed Sentry SDK load inside an error boundary', () => {
  it('is caught and labelled by the route error boundary', async () => {
    render(<RootError error={new Error('boom')} reset={() => undefined} />);
    await waitFor(() => expect(sentryLoadFailureLogged()).toBe(true));
  });

  it('is caught and labelled by the global error boundary', async () => {
    // GlobalError renders <html>; mount it into a detached container.
    render(<GlobalError error={new Error('boom')} reset={() => undefined} />, {
      container: document.createElement('div'),
    });
    await waitFor(() => expect(sentryLoadFailureLogged()).toBe(true));
  });

  it('is caught and labelled by the component ErrorBoundary', async () => {
    function Thrower(): React.ReactNode {
      throw new Error('render failed');
    }
    render(
      <ErrorBoundary fallback={<p>fallback</p>}>
        <Thrower />
      </ErrorBoundary>,
    );
    await waitFor(() => expect(sentryLoadFailureLogged()).toBe(true));
  });
});
