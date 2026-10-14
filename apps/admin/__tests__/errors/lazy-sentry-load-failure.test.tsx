// @vitest-environment jsdom
/**
 * Admin's root error boundaries load the Sentry SDK on demand. They used to
 * import it statically, which put the whole SDK in every console route's first
 * load and defeated the deferred load in instrumentation-client.ts (the same
 * defect apps/web fixed in #1358). That half is measured by `perf:check`, not
 * here.
 *
 * What is asserted is the failure path the lazy load introduces: when the SDK
 * chunk cannot load, the rejection is caught and labelled rather than escaping
 * as an "Uncaught (in promise)" from inside an error boundary. Vitest fails the
 * run on an unhandled rejection, which keeps each case non-vacuous.
 */
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => {
  throw new Error('Loading chunk sentry failed');
});

import ConsoleError from '@/app/error';
import GlobalError from '@/app/global-error';

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

describe('a failed Sentry SDK load inside an admin error boundary', () => {
  it('is caught and labelled by the console error boundary', async () => {
    render(<ConsoleError error={new Error('boom')} reset={() => undefined} />);
    await waitFor(() => expect(sentryLoadFailureLogged()).toBe(true));
  });

  it('is caught and labelled by the global error boundary', async () => {
    render(<GlobalError error={new Error('boom')} reset={() => undefined} />, {
      container: document.createElement('div'),
    });
    await waitFor(() => expect(sentryLoadFailureLogged()).toBe(true));
  });
});
