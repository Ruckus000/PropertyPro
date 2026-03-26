import { describe, expect, it } from 'vitest';
import { getEntityListPath } from '../../src/components/command-palette/command-palette-paths';

describe('getEntityListPath', () => {
  it('uses canonical community routes for documents and meetings', () => {
    expect(
      getEntityListPath('documents', {
        communityId: 7,
        isAdmin: false,
        query: 'budget',
      }),
    ).toBe('/communities/7/documents?q=budget');

    expect(
      getEntityListPath('meetings', {
        communityId: 7,
        isAdmin: false,
        query: 'board',
      }),
    ).toBe('/communities/7/meetings?q=board');
  });

  it('routes maintenance and residents to the correct in-app screens', () => {
    expect(
      getEntityListPath('maintenance', {
        communityId: 9,
        isAdmin: true,
        query: 'leak',
      }),
    ).toBe('/maintenance/inbox?communityId=9&q=leak');

    expect(
      getEntityListPath('maintenance', {
        communityId: 9,
        isAdmin: false,
        query: 'leak',
      }),
    ).toBe('/maintenance/submit?communityId=9&q=leak');

    expect(
      getEntityListPath('residents', {
        communityId: 9,
        isAdmin: true,
        query: 'smith',
      }),
    ).toBe('/dashboard/residents?communityId=9&q=smith');
  });

  it('returns null when a list view requires a community but none is selected', () => {
    expect(
      getEntityListPath('maintenance', {
        communityId: null,
        isAdmin: false,
        query: 'leak',
      }),
    ).toBeNull();
  });
});
