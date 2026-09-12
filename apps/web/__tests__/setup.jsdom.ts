// Setup for the `jsdom` vitest project only.
//
// These imports are the expensive half of the old combined setup file:
// @testing-library/jest-dom and @testing-library/react (which pulls react-dom)
// were previously loaded into all ~790 test workers even though only ~285 use
// RTL, and the axe matchers were loaded for all of them even though exactly two
// files assert accessibility. Anything added here must genuinely need a DOM.
import '@testing-library/jest-dom/vitest';
import * as vitestAxeMatchers from 'vitest-axe/matchers';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(vitestAxeMatchers);

// A clock budget for every `find*` / `waitFor`, raised from RTL's 1000ms. It is
// half of a pair with the jsdom project's `testTimeout` in vitest.shared.ts —
// read the reasoning there, and keep this well below that value.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
