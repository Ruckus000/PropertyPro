import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import GlobalError from '../../src/app/global-error';

describe('GlobalError', () => {
  it('renders fallback content', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('boom')} reset={() => undefined} />,
    );

    expect(html).toContain('Something went wrong');
    expect(html).toContain('Try again');
    expect(html).toContain('An unexpected error occurred. Please try again.');
  });
});
