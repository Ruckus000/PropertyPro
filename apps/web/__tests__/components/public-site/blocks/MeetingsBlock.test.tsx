import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeetingsBlock } from '@/components/public-site/blocks/MeetingsBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const listMeetingsMock = vi.fn();
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listAnnouncements: vi.fn(),
    listDocuments: vi.fn(),
    listMeetings: listMeetingsMock,
    listSiteBlocks: vi.fn(),
    getContactInfo: vi.fn(),
  }),
}));

const community = {
  id: 1,
  slug: 'sunset',
  name: 'Sunset Condos',
  logoUrl: null,
  communityType: 'condo_718' as const,
  city: 'Miami',
  state: 'FL',
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#000',
  secondaryColor: '#fff',
  accentColor: '#0f0',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 4, blockType: 'meetings', blockOrder: 4, content }, community, theme, layout: 'tidewater' };
}

describe('<MeetingsBlock>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the empty state when no upcoming meetings exist', async () => {
    listMeetingsMock.mockResolvedValueOnce([]);
    const ui = await MeetingsBlock(makeProps({ limit: 10, timeWindowDays: 30 }));
    render(ui as React.ReactElement);
    expect(screen.getByText(/No upcoming meetings/i)).toBeInTheDocument();
  });

  it('renders a list of upcoming meetings with title, type, and location', async () => {
    listMeetingsMock.mockResolvedValueOnce([
      {
        id: 1,
        title: 'March Board Meeting',
        meetingType: 'board',
        startsAt: new Date('2026-03-10T18:00:00Z'),
        endsAt: new Date('2026-03-10T20:00:00Z'),
        location: '123 Main St, Miami FL',
      },
    ]);
    const ui = await MeetingsBlock(makeProps({ limit: 10, timeWindowDays: 30 }));
    render(ui as React.ReactElement);
    expect(screen.getByText('March Board Meeting')).toBeInTheDocument();
    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Miami FL')).toBeInTheDocument();
  });

  it('calls listMeetings with parsed limit + timeWindowDays', async () => {
    listMeetingsMock.mockResolvedValueOnce([]);
    await MeetingsBlock(makeProps({ limit: 5, timeWindowDays: 60 }));
    expect(listMeetingsMock).toHaveBeenCalledWith({ limit: 5, timeWindowDays: 60 });
  });

  it('formats underscore meeting types as capitalised readable labels', async () => {
    listMeetingsMock.mockResolvedValueOnce([
      {
        id: 2,
        title: 'Annual Meeting',
        meetingType: 'annual_general',
        startsAt: new Date('2026-04-01T14:00:00Z'),
        endsAt: null,
        location: 'Community Room',
      },
    ]);
    const ui = await MeetingsBlock(makeProps({ limit: 10, timeWindowDays: 90 }));
    render(ui as React.ReactElement);
    expect(screen.getByText('Annual general')).toBeInTheDocument();
  });

  it('emits console.warn + renders null on invalid config', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await MeetingsBlock(makeProps({ limit: 999 })); // out of range
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('meetings block content'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('renders the "When" label for meeting start time', async () => {
    listMeetingsMock.mockResolvedValueOnce([
      {
        id: 3,
        title: 'Budget Review',
        meetingType: 'budget',
        startsAt: new Date('2026-05-15T19:00:00Z'),
        endsAt: null,
        location: 'Conference Room A',
      },
    ]);
    const ui = await MeetingsBlock(makeProps({ limit: 10, timeWindowDays: 30 }));
    render(ui as React.ReactElement);
    expect(screen.getByText('When')).toBeInTheDocument();
    expect(screen.getByText('Where')).toBeInTheDocument();
  });
});
