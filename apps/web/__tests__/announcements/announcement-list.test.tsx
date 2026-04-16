import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnnouncementList } from '../../src/components/announcements/announcement-list';

const sampleAnnouncement = {
  id: 17,
  communityId: 42,
  title: 'Roof inspection scheduled',
  body: '<p>Inspectors arrive next Tuesday.</p>',
  audience: 'all',
  isPinned: false,
  archivedAt: null,
  publishedBy: 'user-1',
  publishedAt: new Date('2026-04-10T12:00:00.000Z'),
  createdAt: new Date('2026-04-10T12:00:00.000Z'),
  updatedAt: new Date('2026-04-10T12:00:00.000Z'),
  deletedAt: null,
} as const;

describe('AnnouncementList', () => {
  it('renders the admin empty-state CTA to the routed create page', () => {
    render(
      <AnnouncementList
        items={[]}
        communityId={42}
        canWriteAnnouncements
      />,
    );

    expect(screen.getByRole('link', { name: 'Create announcement' })).toHaveAttribute(
      'href',
      '/announcements/new?communityId=42',
    );
  });

  it('shows edit links only for users with announcement write access', () => {
    const { rerender } = render(
      <AnnouncementList
        items={[sampleAnnouncement]}
        communityId={42}
        canWriteAnnouncements
      />,
    );

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/announcements/17/edit?communityId=42',
    );

    rerender(
      <AnnouncementList
        items={[sampleAnnouncement]}
        communityId={42}
        canWriteAnnouncements={false}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      '/announcements/17?communityId=42',
    );
  });

  it('renders the announcement title as a level 3 heading linked to the detail page', () => {
    render(
      <AnnouncementList
        items={[sampleAnnouncement]}
        communityId={42}
        canWriteAnnouncements={false}
      />,
    );

    const heading = screen.getByRole('heading', {
      level: 3,
      name: 'Roof inspection scheduled',
    });

    expect(heading).toContainElement(
      screen.getByRole('link', { name: 'Roof inspection scheduled' }),
    );
    expect(screen.getByRole('link', { name: 'Roof inspection scheduled' })).toHaveAttribute(
      'href',
      '/announcements/17?communityId=42',
    );
  });
});
