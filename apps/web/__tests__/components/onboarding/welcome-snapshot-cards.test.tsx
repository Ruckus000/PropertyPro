import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OwnerCards } from '../../../src/components/onboarding/welcome-snapshot-cards';

describe('OwnerCards', () => {
  it('routes the latest announcement link to the scoped announcements list', () => {
    render(
      <OwnerCards
        communityId={42}
        community={{
          name: 'Sunset Condos',
          slug: 'sunset-condos',
          city: 'Miami',
          state: 'FL',
          communityType: 'condo_718',
        }}
        announcement={{
          id: 17,
          title: 'Roof inspection scheduled',
          publishedAt: '2026-04-10T12:00:00.000Z',
        }}
        compliance={{
          score: 92,
          totalItems: 12,
          satisfiedItems: 11,
        }}
      />,
    );

    expect(screen.getByRole('link', { name: 'View announcements' })).toHaveAttribute(
      'href',
      '/announcements?communityId=42',
    );
  });
});
