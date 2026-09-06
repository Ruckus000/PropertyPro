/**
 * The four presentational block views.
 *
 * These exist so the editor canvas can render the published markup without
 * being an async server component. The contract each test defends is that a
 * view renders from PROPS ALONE — no fetching, no async, no hooks. If one of
 * these starts needing a mock of the DB reader, the split has been undone and
 * the canvas will break at a distance from the change that caused it.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnouncementsBlockView } from '@/components/public-site/blocks/AnnouncementsBlockView';
import { DocumentsBlockView } from '@/components/public-site/blocks/DocumentsBlockView';
import { MeetingsBlockView } from '@/components/public-site/blocks/MeetingsBlockView';
import { ContactBlockView } from '@/components/public-site/blocks/ContactBlockView';
import type { PublicCommunity } from '@/components/public-site/blocks/types';

const COMMUNITY: PublicCommunity = {
  id: 7,
  slug: 'sunset-condos',
  name: 'Sunset Condos',
  logoUrl: null,
  communityType: 'condo_718',
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};

/** A community row carrying a timezone that Intl will reject. */
const BAD_TZ_COMMUNITY: PublicCommunity = { ...COMMUNITY, timezone: 'Not/AZone' };

describe('AnnouncementsBlockView', () => {
  const content = { limit: 5, timeWindowDays: 30 };
  const item = {
    id: 1,
    title: 'Pool closed Monday',
    body: '<p>Resurfacing</p>',
    bodyHtml: '<p>Resurfacing</p>',
    publishedAt: new Date('2026-03-04T15:00:00Z'),
    isPinned: false,
  };

  it('renders items from props with no data access', () => {
    render(
      <AnnouncementsBlockView blockId={1} content={content} data={[item]} community={COMMUNITY} />,
    );
    expect(screen.getByRole('heading', { name: 'Announcements' })).toBeInTheDocument();
    expect(screen.getByText('Pool closed Monday')).toBeInTheDocument();
    expect(screen.getByText('Resurfacing')).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(
      <AnnouncementsBlockView blockId={1} content={content} data={[]} community={COMMUNITY} />,
    );
    expect(screen.getByText('No announcements yet.')).toBeInTheDocument();
  });

  it('marks pinned announcements', () => {
    render(
      <AnnouncementsBlockView
        blockId={1}
        content={content}
        data={[{ ...item, isPinned: true } as never]}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByText('Pinned')).toBeInTheDocument();
  });

  it('renders bodyHtml as given — sanitisation is the shell&apos;s job', () => {
    // The view trusts bodyHtml. This test documents that trust so nobody
    // "helpfully" pipes raw user input in at a call site.
    render(
      <AnnouncementsBlockView
        blockId={1}
        content={content}
        data={[{ ...item, bodyHtml: '<strong>bold</strong>' } as never]}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('falls back to the default zone on an invalid community timezone', () => {
    // Legacy rows carry unparseable timezones; a block must not crash the page.
    expect(() =>
      render(
        <AnnouncementsBlockView
          blockId={1}
          content={content}
          data={[item]}
          community={BAD_TZ_COMMUNITY}
        />,
      ),
    ).not.toThrow();
  });

  it('links the heading to the section for assistive tech', () => {
    const { container } = render(
      <AnnouncementsBlockView blockId={9} content={content} data={[]} community={COMMUNITY} />,
    );
    expect(container.querySelector('section')).toHaveAttribute(
      'aria-labelledby',
      'announcements-9',
    );
  });
});

describe('DocumentsBlockView', () => {
  const content = { limit: 5, includeCategories: [] } as never;
  const doc = {
    id: 12,
    title: 'FY26 Budget',
    description: 'Approved November',
    categoryName: 'budget',
    createdAt: new Date('2026-01-10T12:00:00Z'),
  };

  it('renders documents from props', () => {
    render(<DocumentsBlockView blockId={2} content={content} data={[doc as never]} community={COMMUNITY} />);
    expect(screen.getByText('FY26 Budget')).toBeInTheDocument();
    expect(screen.getByText('Approved November')).toBeInTheDocument();
    expect(screen.getByText('budget')).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(<DocumentsBlockView blockId={2} content={content} data={[]} community={COMMUNITY} />);
    expect(screen.getByText('No documents available.')).toBeInTheDocument();
  });

  it('scopes the download link to the community', () => {
    // The download route is tenant-scoped; dropping communityId here would send
    // visitors to another community's document.
    render(<DocumentsBlockView blockId={2} content={content} data={[doc as never]} community={COMMUNITY} />);
    const link = screen.getByRole('link', { name: 'Download FY26 Budget' });
    expect(link).toHaveAttribute(
      'href',
      '/api/v1/public/documents/12/download?communityId=7',
    );
  });

  it('omits the description when there is none', () => {
    render(
      <DocumentsBlockView
        blockId={2}
        content={content}
        data={[{ ...doc, description: null } as never]}
        community={COMMUNITY}
      />,
    );
    expect(screen.queryByText('Approved November')).not.toBeInTheDocument();
  });
});

describe('MeetingsBlockView', () => {
  const content = { limit: 10, timeWindowDays: 30 } as never;
  const meeting = {
    id: 3,
    title: 'Annual Meeting',
    meetingType: 'board_meeting',
    startsAt: new Date('2026-04-01T23:00:00Z'),
    location: 'Clubhouse',
  };

  it('renders meetings from props', () => {
    render(<MeetingsBlockView blockId={3} content={content} data={[meeting as never]} community={COMMUNITY} />);
    expect(screen.getByText('Annual Meeting')).toBeInTheDocument();
    expect(screen.getByText('Clubhouse')).toBeInTheDocument();
  });

  it('humanises the meeting type', () => {
    render(<MeetingsBlockView blockId={3} content={content} data={[meeting as never]} community={COMMUNITY} />);
    expect(screen.getByText('Board meeting')).toBeInTheDocument();
  });

  it('omits the location row when there is none', () => {
    render(
      <MeetingsBlockView
        blockId={3}
        content={content}
        data={[{ ...meeting, location: null } as never]}
        community={COMMUNITY}
      />,
    );
    expect(screen.queryByText('Where')).not.toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(<MeetingsBlockView blockId={3} content={content} data={[]} community={COMMUNITY} />);
    expect(screen.getByText('No upcoming meetings.')).toBeInTheDocument();
  });

  it('survives an invalid community timezone', () => {
    expect(() =>
      render(
        <MeetingsBlockView
          blockId={3}
          content={content}
          data={[meeting as never]}
          community={BAD_TZ_COMMUNITY}
        />,
      ),
    ).not.toThrow();
  });
});

describe('ContactBlockView', () => {
  const content = { showManagement: true, showBoard: true } as never;
  const management = { name: 'Coastal Property Group', email: 'office@coastalpg.com', phone: '(305) 555-0142' };
  const board = [{ name: 'Sam Whitfield', title: 'President' }];

  it('renders management and board from props', () => {
    render(
      <ContactBlockView
        blockId={4}
        content={content}
        data={{ management, board } as never}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByRole('link', { name: 'office@coastalpg.com' })).toHaveAttribute(
      'href',
      'mailto:office@coastalpg.com',
    );
    expect(screen.getByRole('link', { name: '(305) 555-0142' })).toHaveAttribute(
      'href',
      'tel:(305) 555-0142',
    );
    expect(screen.getByText('Sam Whitfield')).toBeInTheDocument();
  });

  it('renders management alone', () => {
    render(
      <ContactBlockView
        blockId={4}
        content={content}
        data={{ management, board: [] } as never}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByRole('region', { name: 'Management contact' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Board roster' })).not.toBeInTheDocument();
  });

  it('renders the board alone', () => {
    render(
      <ContactBlockView
        blockId={4}
        content={content}
        data={{ management: null, board } as never}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByRole('region', { name: 'Board roster' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Management contact' })).not.toBeInTheDocument();
  });

  it('falls back when there is nothing to show', () => {
    render(
      <ContactBlockView
        blockId={4}
        content={content}
        data={{ management: null, board: [] } as never}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByText('Contact information will be posted here soon.')).toBeInTheDocument();
  });

  it('skips blank management fields rather than rendering empty rows', () => {
    render(
      <ContactBlockView
        blockId={4}
        content={content}
        data={{ management: { name: 'Coastal', email: '  ', phone: null }, board: [] } as never}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByText('Coastal')).toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Phone')).not.toBeInTheDocument();
  });
});

describe('per-block empty text (Phase 9)', () => {
  // A schema field with no consumer is dead config, so these assert the
  // override actually reaches the DOM — and that omitting it keeps the copy
  // every existing published site already renders.
  it('overrides the built-in announcements copy', () => {
    render(
      <AnnouncementsBlockView
        blockId={1}
        content={{ limit: 5, timeWindowDays: 30, emptyText: 'Check back after the board meeting.' }}
        data={[]}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByText('Check back after the board meeting.')).toBeInTheDocument();
    expect(screen.queryByText('No announcements yet.')).not.toBeInTheDocument();
  });

  it('overrides the built-in documents copy', () => {
    render(
      <DocumentsBlockView
        blockId={2}
        content={{ limit: 5, emptyText: 'Records are posted after each meeting.' }}
        data={[]}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByText('Records are posted after each meeting.')).toBeInTheDocument();
  });

  it('overrides the built-in meetings copy', () => {
    render(
      <MeetingsBlockView
        blockId={3}
        content={{ limit: 10, timeWindowDays: 30, emptyText: 'No meetings scheduled this quarter.' }}
        data={[]}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByText('No meetings scheduled this quarter.')).toBeInTheDocument();
  });

  it('keeps the built-in copy when no override is set', () => {
    render(
      <MeetingsBlockView
        blockId={3}
        content={{ limit: 10, timeWindowDays: 30 }}
        data={[]}
        community={COMMUNITY}
      />,
    );
    expect(screen.getByText('No upcoming meetings.')).toBeInTheDocument();
  });
});
