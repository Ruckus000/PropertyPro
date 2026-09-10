// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AuthLoading from '@/app/auth/loading';
import ConsoleRootLoading from '@/app/loading';

/**
 * The root layout renders a skip link pointing at `#main-content`. That id is
 * normally owned by `AdminShell`'s <main> (console routes) or by
 * `auth/login/page.tsx`'s own root div (the login screen). Both of those are
 * REPLACED by a `loading.tsx` fallback while the segment is in flight, so
 * without an id here the skip link is a dead anchor for the duration —
 * a keyboard user tabs to "Skip to main content", activates it, and nothing
 * happens.
 *
 * Sub-second, but the fix is one attribute and the alternative is a skip link
 * that silently does nothing. Neither fallback ever coexists with the element
 * that normally owns the id, so there is no duplicate.
 */
describe('loading fallbacks keep the skip link alive', () => {
  it('the console fallback provides #main-content', () => {
    const { container } = render(<ConsoleRootLoading />);
    expect(container.querySelector('#main-content')).not.toBeNull();
  });

  it('the auth fallback provides #main-content', () => {
    const { container } = render(<AuthLoading />);
    expect(container.querySelector('#main-content')).not.toBeNull();
  });

  it('neither fallback declares the id more than once', () => {
    for (const Component of [ConsoleRootLoading, AuthLoading]) {
      const { container } = render(<Component />);
      expect(container.querySelectorAll('#main-content')).toHaveLength(1);
    }
  });
});
