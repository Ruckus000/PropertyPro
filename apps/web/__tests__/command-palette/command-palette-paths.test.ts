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

  // T11: admin/non-admin now produce the same URL — Operations hub handles
  // role-based scope within the single /operations?tab=requests page.
  it('routes maintenance and residents to the correct in-app screens', () => {
    expect(
      getEntityListPath('maintenance', {
        communityId: 9,
        isAdmin: true,
        query: 'leak',
      }),
    ).toBe('/communities/9/operations?tab=requests&q=leak');

    expect(
      getEntityListPath('maintenance', {
        communityId: 9,
        isAdmin: false,
        query: 'leak',
      }),
    ).toBe('/communities/9/operations?tab=requests&q=leak');

    expect(
      getEntityListPath('residents', {
        communityId: 9,
        isAdmin: true,
        query: 'smith',
      }),
    ).toBe('/dashboard/residents?communityId=9&q=smith');
  });

  it('routes violations search hits to inbox vs resident report paths', () => {
    expect(
      getEntityListPath('violations', {
        communityId: 5,
        isAdmin: true,
        query: 'noise',
      }),
    ).toBe('/violations?communityId=5&q=noise');

    expect(
      getEntityListPath('violations', {
        communityId: 5,
        isAdmin: false,
        query: '',
      }),
    ).toBe('/violations/report?communityId=5');
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
