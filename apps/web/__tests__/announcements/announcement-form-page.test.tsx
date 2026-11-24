/**
 * New and Edit announcement pages. The header has Cancel only (owner decision,
 * 2026-11-24): Delete stays on the announcement's own page.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { formProps } = vi.hoisted(() => ({ formProps: vi.fn() }));
vi.mock('@/components/announcements/announcement-authoring-form', () => ({
  AnnouncementAuthoringForm: (props: unknown) => {
    formProps(props);
    return <form aria-label="Composer stub" />;
  },
}));

import { AnnouncementFormPage } from '../../src/components/announcements/announcement-form-page';

const existing = {
  id: 9,
  title: 'Pool closed',
  body: '<p>Maintenance</p>',
  audience: 'owners_only' as const,
  isPinned: true,
  expiresAt: '2026-12-01T17:00:00.000Z',
};

describe('AnnouncementFormPage', () => {
  it('new: titled "New Announcement", Cancel goes back to the list', () => {
    render(<AnnouncementFormPage communityId={7} communityType="condo_718" />);

    expect(screen.getByRole('heading', { level: 1, name: 'New Announcement' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/announcements?communityId=7',
    );
    expect(formProps).toHaveBeenLastCalledWith({
      communityId: 7,
      communityType: 'condo_718',
      announcement: undefined,
    });
  });

  it('edit: Cancel goes back to the announcement, and the form gets it unchanged', () => {
    render(<AnnouncementFormPage communityId={7} communityType="apartment" announcement={existing} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Edit Announcement' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/announcements/9?communityId=7',
    );
    expect(formProps).toHaveBeenLastCalledWith({
      communityId: 7,
      communityType: 'apartment',
      announcement: existing,
    });
  });

  it('edit: the header has Cancel only, no Delete', () => {
    render(<AnnouncementFormPage communityId={7} communityType="condo_718" announcement={existing} />);

    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Cancel']);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });
});
