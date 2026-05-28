import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnouncementsBlock } from '@/components/public-site/blocks/AnnouncementsBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const listAnnouncementsMock = vi.fn();
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listAnnouncements: listAnnouncementsMock,
    listSiteBlocks: vi.fn(),
    listDocuments: vi.fn(),
    listMeetings: vi.fn(),
    getContactInfo: vi.fn(),
  }),
}));

vi.mock('@/lib/utils/html-sanitizer', () => ({
  sanitizeHtml: (s: string) => s.replace(/<script[^>]*>.*?<\/script>/gi, ''),
}));

const community = { id: 1, slug: 's', name: 'X', logoUrl: null, communityType: 'condo_718' as const, city: null, state: null, timezone: 'America/New_York' };
const theme = { primaryColor: '#000', secondaryColor: '#fff', accentColor: '#0f0', headingFont: 'Inter', bodyFont: 'Inter' };

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 1, blockType: 'announcements', blockOrder: 2, content }, community, theme, layout: 'tidewater' };
}

describe('<AnnouncementsBlock>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an empty state when no announcements exist', async () => {
    listAnnouncementsMock.mockResolvedValueOnce([]);
    const ui = await AnnouncementsBlock(makeProps({ limit: 5, timeWindowDays: 30 }));
    render(ui as React.ReactElement);
    expect(screen.getByText(/No announcements yet/i)).toBeInTheDocument();
  });

  it('renders a list of announcements', async () => {
    listAnnouncementsMock.mockResolvedValueOnce([
      { id: 1, title: 'Pool closed', body: '<p>The pool will be closed.</p>', isPinned: false, publishedAt: new Date('2026-05-01T12:00:00Z') },
      { id: 2, title: 'Board meeting', body: '<p>Next month.</p>', isPinned: true, publishedAt: new Date('2026-05-15T12:00:00Z') },
    ]);
    const ui = await AnnouncementsBlock(makeProps({ limit: 5, timeWindowDays: 30 }));
    render(ui as React.ReactElement);
    expect(screen.getByText('Pool closed')).toBeInTheDocument();
    expect(screen.getByText('Board meeting')).toBeInTheDocument();
  });

  it('marks pinned announcements with a Pinned label', async () => {
    listAnnouncementsMock.mockResolvedValueOnce([
      { id: 1, title: 'Important', body: '<p>x</p>', isPinned: true, publishedAt: new Date() },
    ]);
    const ui = await AnnouncementsBlock(makeProps({ limit: 5, timeWindowDays: 30 }));
    render(ui as React.ReactElement);
    expect(screen.getByText(/Pinned/i)).toBeInTheDocument();
  });

  it('sanitizes HTML in the body (strips <script>)', async () => {
    listAnnouncementsMock.mockResolvedValueOnce([
      { id: 1, title: 'Safe', body: '<p>Hello</p><script>alert(1)</script>', isPinned: false, publishedAt: new Date() },
    ]);
    const ui = await AnnouncementsBlock(makeProps({ limit: 5, timeWindowDays: 30 }));
    render(ui as React.ReactElement);
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('calls listAnnouncements with parsed limit + timeWindowDays', async () => {
    listAnnouncementsMock.mockResolvedValueOnce([]);
    await AnnouncementsBlock(makeProps({ limit: 10, timeWindowDays: 60 }));
    expect(listAnnouncementsMock).toHaveBeenCalledWith({ limit: 10, timeWindowDays: 60 });
  });

  it('emits console.warn + renders null on invalid config', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await AnnouncementsBlock(makeProps({ limit: 999 })); // out of range
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('announcements block content'), expect.anything());
    warnSpy.mockRestore();
  });

  it('does not crash when an announcement body is null', async () => {
    listAnnouncementsMock.mockResolvedValueOnce([
      { id: 1, title: 'Title only', body: null as unknown as string, isPinned: false, publishedAt: new Date('2026-05-01T12:00:00Z') },
    ]);
    const ui = await AnnouncementsBlock(makeProps({ limit: 5, timeWindowDays: 30 }));
    expect(() => render(ui as React.ReactElement)).not.toThrow();
    expect(screen.getByText('Title only')).toBeInTheDocument();
  });

  it('falls back gracefully when community.timezone is invalid', async () => {
    listAnnouncementsMock.mockResolvedValueOnce([
      { id: 1, title: 'Hi', body: '<p>x</p>', isPinned: false, publishedAt: new Date('2026-05-01T12:00:00Z') },
    ]);
    const props = { ...makeProps({ limit: 5, timeWindowDays: 30 }), community: { ...community, timezone: 'Not/A_Real_Zone' } };
    const ui = await AnnouncementsBlock(props);
    expect(() => render(ui as React.ReactElement)).not.toThrow();
  });
});
