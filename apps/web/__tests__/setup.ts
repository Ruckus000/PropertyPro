import '@testing-library/jest-dom/vitest';
import * as vitestAxeMatchers from 'vitest-axe/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(vitestAxeMatchers);

afterEach(() => {
  cleanup();
});
