/**
 * Quick links (D16): shortcuts to the other sections on the same page.
 *
 * The shell decides which links have somewhere to land. A link shows only when
 * its section is on the page AND that section would render something, read
 * with that section's own settings, so a link never points at nothing. Owner
 * documents always shows. The view renders what it is given.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QuickLinksBlock } from '@/components/public-site/blocks/QuickLinksBlock';
import {
  QuickLinksBlockView,
  type QuickLinksData,
} from '@/components/public-site/blocks/QuickLinksBlockView';
import type {
  BlockRendererProps,
  PageSection,
  PublicCommunity,
} from '@/components/public-site/blocks/types';
import type { PublicContactInfo } from '@/lib/db/public-community-reader';

const reader = vi.hoisted(() => ({
  listMeetings: vi.fn(),
  listAnnouncements: vi.fn(),
  getContactInfo: vi.fn(),
  listSiteBlocks: vi.fn(),
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => reader,
}));

const community: PublicCommunity = {
  id: 42,
  slug: 'harbor-pointe',
  name: 'Harbor Pointe Condominium Association',
  shortName: 'Harbor Pointe',
  logoUrl: null,
  communityType: 'condo_718',
  city: 'Miami',
  state: 'FL',
  unitCount: 120,
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#000',
  secondaryColor: '#fff',
  accentColor: '#0f0',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

/** Tuesday, November 17 2026, 6:30 PM in Miami. */
const NEXT_MEETING = {
  id: 1,
  title: 'Board of Directors meeting',
  meetingType: 'board',
  startsAt: new Date('2026-11-17T23:30:00Z'),
  endsAt: null,
  location: 'Clubhouse',
};
const ANNOUNCEMENT = {
  id: 2,
  title: 'Pool deck resurfacing',
  body: '<p>Closed November 2 to 6.</p>',
  isPinned: false,
  publishedAt: new Date('2026-10-20T12:00:00Z'),
};

function contactInfo(overrides: Partial<PublicContactInfo> = {}): PublicContactInfo {
  return { management: null, board: [], address: null, officeHours: null, ...overrides };
}

const MEETINGS: PageSection = { id: 3, blockType: 'meetings', content: { limit: 5 } };
const NEWS: PageSection = { id: 4, blockType: 'announcements', content: { limit: 3 } };
const CONTACT: PageSection = {
  id: 6,
  blockType: 'contact',
  content: { showBoard: true, showManagement: true },
};

function makeProps(
  pageSections: readonly PageSection[] | undefined,
  content: unknown = {},
): BlockRendererProps {
  return {
    block: { id: 2, blockType: 'quicklinks', blockOrder: 2, content },
    community,
    theme,
    layout: 'tidewater',
    ...(pageSections === undefined ? {} : { pageSections }),
  };
}

async function renderShell(props: BlockRendererProps) {
  const ui = await QuickLinksBlock(props);
  return { ui, ...render(<>{ui}</>) };
}

/** The visible links, in order, by their accessible name. */
function linkNames(): string[] {
  return screen.queryAllByRole('link').map((link) => link.textContent ?? '');
}

beforeEach(() => {
  vi.clearAllMocks();
  reader.listMeetings.mockResolvedValue([NEXT_MEETING]);
  reader.listAnnouncements.mockResolvedValue([ANNOUNCEMENT]);
  reader.getContactInfo.mockResolvedValue(contactInfo({ address: '1450 Harbor Pointe Drive, Miami, FL' }));
});

describe('<QuickLinksBlock> shell', () => {
  it("quick links show the next meeting's date", async () => {
    await renderShell(makeProps([MEETINGS]));

    const meetings = screen.getByRole('link', { name: /Meetings/ });
    expect(meetings).toHaveAttribute('href', '#meetings');
    expect(meetings).toHaveTextContent('Next: Tue, Nov 17');
    expect(within(meetings).getByText('Tue, Nov 17').closest('time')).toHaveAttribute(
      'dateTime',
      '2026-11-17T23:30:00.000Z',
    );
  });

  it('quick links leave out News when there are no announcements', async () => {
    reader.listAnnouncements.mockResolvedValue([]);
    await renderShell(makeProps([MEETINGS, NEWS, CONTACT]));

    expect(screen.queryByRole('link', { name: 'News' })).not.toBeInTheDocument();
    expect(linkNames()).toEqual(['MeetingsNext: Tue, Nov 17', 'Owner documents', 'Contact']);
  });

  it('quick links always show Owner documents', async () => {
    // On a page with none of the other three sections, and with no data at all,
    // the sign-in to the owners' records is still worth a link.
    reader.listMeetings.mockResolvedValue([]);
    reader.listAnnouncements.mockResolvedValue([]);
    reader.getContactInfo.mockResolvedValue(contactInfo());

    for (const sections of [undefined, [], [MEETINGS, NEWS, CONTACT]]) {
      const { unmount } = await renderShell(makeProps(sections));
      expect(screen.getByRole('link', { name: 'Owner documents' })).toHaveAttribute(
        'href',
        '/auth/login',
      );
      expect(linkNames()).toEqual(['Owner documents']);
      unmount();
    }
  });

  it('shows all four links, in order, when every section has something', async () => {
    await renderShell(makeProps([MEETINGS, NEWS, CONTACT]));

    expect(linkNames()).toEqual([
      'MeetingsNext: Tue, Nov 17',
      'News',
      'Owner documents',
      'Contact',
    ]);
    expect(screen.getByRole('link', { name: 'News' })).toHaveAttribute('href', '#announcements');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '#contact');
  });

  it('leaves out a link whose section is not on the page, without reading its data', async () => {
    await renderShell(makeProps([CONTACT]));

    expect(linkNames()).toEqual(['Owner documents', 'Contact']);
    expect(reader.listMeetings).not.toHaveBeenCalled();
    expect(reader.listAnnouncements).not.toHaveBeenCalled();
  });

  it('leaves out Meetings when the Meetings section has nothing upcoming', async () => {
    reader.listMeetings.mockResolvedValue([]);
    await renderShell(makeProps([MEETINGS, NEWS]));

    expect(screen.queryByRole('link', { name: /Meetings/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Next:/)).not.toBeInTheDocument();
  });

  it("reads each section's data with that section's own settings", async () => {
    // A Meetings section showing 30 days renders nothing for a meeting 60 days
    // out, so a link judged on a wider window would land on nothing.
    await renderShell(
      makeProps([
        { id: 3, blockType: 'meetings', content: { limit: 5, timeWindowDays: 60 } },
        { id: 4, blockType: 'announcements', content: { timeWindowDays: 90 } },
        { id: 6, blockType: 'contact', content: { showBoard: false, showManagement: true } },
      ]),
    );

    expect(reader.listMeetings).toHaveBeenCalledWith({ limit: 1, timeWindowDays: 60 });
    expect(reader.listAnnouncements).toHaveBeenCalledWith({ limit: 1, timeWindowDays: 90 });
    expect(reader.getContactInfo).toHaveBeenCalledWith({ showBoard: false, showManagement: true });
  });

  it('falls back to each section schema default when the section sets none', async () => {
    await renderShell(makeProps([MEETINGS, NEWS, { id: 6, blockType: 'contact', content: {} }]));

    expect(reader.listMeetings).toHaveBeenCalledWith({ limit: 1, timeWindowDays: 30 });
    expect(reader.listAnnouncements).toHaveBeenCalledWith({ limit: 1, timeWindowDays: 30 });
    expect(reader.getContactInfo).toHaveBeenCalledWith({ showBoard: true, showManagement: true });
  });

  it("leaves out Contact when the page's Contact section would show nothing", async () => {
    reader.getContactInfo.mockResolvedValue(
      // Board members exist, but this Contact section has its board switched off.
      contactInfo({ board: [] }),
    );
    await renderShell(
      makeProps([{ id: 6, blockType: 'contact', content: { showBoard: false, showManagement: true } }]),
    );

    expect(screen.queryByRole('link', { name: 'Contact' })).not.toBeInTheDocument();
  });

  it('shows Contact for a board-only Contact section', async () => {
    reader.getContactInfo.mockResolvedValue(
      contactInfo({ board: [{ name: 'Maria Delgado', title: 'Board President' }] }),
    );
    await renderShell(makeProps([CONTACT]));

    expect(screen.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '#contact');
  });

  it('judges a link by the first section of its type, the one its anchor lands on', async () => {
    await renderShell(
      makeProps([
        { id: 3, blockType: 'meetings', content: { timeWindowDays: 7 } },
        { id: 9, blockType: 'meetings', content: { timeWindowDays: 365 } },
      ]),
    );

    expect(reader.listMeetings).toHaveBeenCalledTimes(1);
    expect(reader.listMeetings).toHaveBeenCalledWith({ limit: 1, timeWindowDays: 7 });
  });

  it('treats a section whose content fails its schema as absent, because it renders nothing', async () => {
    await renderShell(
      makeProps([{ id: 3, blockType: 'meetings', content: { limit: 0 } }, NEWS]),
    );

    expect(reader.listMeetings).not.toHaveBeenCalled();
    expect(linkNames()).toEqual(['News', 'Owner documents']);
  });

  it('carries the anchor id the page gives it, and none otherwise', async () => {
    const { container, unmount } = await renderShell({
      ...makeProps([]),
      anchorId: 'quicklinks',
    });
    expect(container.querySelector('section')).toHaveAttribute('id', 'quicklinks');
    unmount();

    const second = await renderShell(makeProps([]));
    expect(second.container.querySelector('section')).not.toHaveAttribute('id');
  });

  it('renders nothing and warns when its content fails the schema', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ui } = await renderShell(makeProps([MEETINGS], { links: ['#meetings'] }));

    expect(ui).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('quicklinks block content'),
      expect.anything(),
    );
    expect(reader.listMeetings).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('<QuickLinksBlockView>', () => {
  const ALL: QuickLinksData = {
    nextMeeting: { startsAt: '2026-11-17T23:30:00.000Z' },
    showMeetings: true,
    showNews: true,
    showContact: true,
  };

  function renderView(data: QuickLinksData, overrides: Partial<PublicCommunity> = {}) {
    return render(
      <QuickLinksBlockView
        blockId={2}
        content={{}}
        data={data}
        community={{ ...community, ...overrides }}
      />,
    );
  }

  it("dates the next meeting in the community's time zone", () => {
    // 01:30 UTC on the 18th is still the evening of the 17th in Miami.
    renderView({ ...ALL, nextMeeting: { startsAt: '2026-11-18T01:30:00.000Z' } });
    expect(screen.getByRole('link', { name: /Meetings/ })).toHaveTextContent('Next: Tue, Nov 17');
  });

  it('falls back to Eastern time for a time zone Intl rejects', () => {
    renderView(ALL, { timezone: 'Not/AZone' });
    expect(screen.getByRole('link', { name: /Meetings/ })).toHaveTextContent('Next: Tue, Nov 17');
  });

  it('shows Meetings without a date when it has none to show', () => {
    renderView({ ...ALL, nextMeeting: null });
    expect(screen.getByRole('link', { name: 'Meetings' })).toBeInTheDocument();
    expect(screen.queryByText(/Next:/)).not.toBeInTheDocument();
  });

  it('names the section for assistive tech without painting a heading', () => {
    renderView(ALL);
    const section = screen.getByRole('region', { name: 'Quick links' });
    expect(section.querySelector('h2')).toHaveClass('sr-only');
  });

  it('hides its icons from assistive tech', () => {
    const { container } = renderView(ALL);
    const icons = Array.from(container.querySelectorAll('svg'));
    expect(icons.length).toBe(4);
    expect(icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
