/**
 * The data sections carry the anchor the page gives them.
 *
 * Quick links points at `#meetings`, `#announcements` and `#contact`; the page
 * renderer hands the first section of each data type its type as `anchorId`
 * (see `page-sections.ts`). Each shell puts it on the root of what it renders.
 * The editor canvas renders the views with no anchor, so they carry no id there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AnnouncementsBlock } from '@/components/public-site/blocks/AnnouncementsBlock';
import { ContactBlock } from '@/components/public-site/blocks/ContactBlock';
import { DocumentsBlock } from '@/components/public-site/blocks/DocumentsBlock';
import { MeetingsBlock } from '@/components/public-site/blocks/MeetingsBlock';
import { MeetingsBlockView } from '@/components/public-site/blocks/MeetingsBlockView';
import type { BlockRendererProps, PublicCommunity } from '@/components/public-site/blocks/types';

const reader = vi.hoisted(() => ({
  listAnnouncements: vi.fn(),
  listDocuments: vi.fn(),
  listMeetings: vi.fn(),
  listOwnerRecordGroups: vi.fn(),
  getContactInfo: vi.fn(),
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => reader,
}));

// The announcements shell sanitizes through isomorphic-dompurify, which drags
// jsdom in; a passthrough keeps this file about anchors.
vi.mock('@/lib/utils/html-sanitizer', () => ({
  sanitizeHtml: (html: string) => html,
}));

const community: PublicCommunity = {
  id: 42,
  slug: 'sunset',
  name: 'Sunset Condos',
  shortName: null,
  logoUrl: null,
  communityType: 'condo_718',
  city: 'Miami',
  state: 'FL',
  unitCount: null,
  timezone: 'America/New_York',
};
const theme = {
  primaryColor: '#000',
  secondaryColor: '#fff',
  accentColor: '#0f0',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

const MEETING = {
  id: 1,
  title: 'Board meeting',
  meetingType: 'board',
  startsAt: new Date('2026-11-17T23:30:00Z'),
  endsAt: null,
  location: 'Clubhouse',
};
const ANNOUNCEMENT = {
  id: 2,
  title: 'Pool closed',
  body: '<p>Tuesday.</p>',
  isPinned: false,
  publishedAt: new Date('2026-10-20T12:00:00Z'),
};
const PUBLIC_DOCUMENT = {
  id: 3,
  title: 'Budget 2026',
  description: null,
  filePath: '42/documents/budget.pdf',
  fileName: 'budget.pdf',
  categoryName: 'budget',
  createdAt: new Date('2026-01-15T10:00:00Z'),
};
const RECORD_GROUP = { category: 'financial_records', label: 'Financial records', postedCount: 3 };

function props(
  blockType: BlockRendererProps['block']['blockType'],
  content: unknown,
  anchorId?: string,
): BlockRendererProps {
  return {
    block: { id: 7, blockType, blockOrder: 3, content },
    community,
    theme,
    layout: 'tidewater',
    ...(anchorId === undefined ? {} : { anchorId }),
  };
}

async function sectionIds(ui: Promise<unknown>): Promise<Array<string | null>> {
  const { container } = render(<>{(await ui) as React.ReactNode}</>);
  // Only the top-level sections: Contact nests its cards in <section>s too.
  return Array.from(container.querySelectorAll(':scope > section')).map((s) => s.getAttribute('id'));
}

beforeEach(() => {
  vi.clearAllMocks();
  reader.listMeetings.mockResolvedValue([MEETING]);
  reader.listAnnouncements.mockResolvedValue([ANNOUNCEMENT]);
  reader.listDocuments.mockResolvedValue([PUBLIC_DOCUMENT]);
  reader.listOwnerRecordGroups.mockResolvedValue([RECORD_GROUP]);
  reader.getContactInfo.mockResolvedValue({
    management: null,
    board: [],
    address: '100 Palm Way, Miami, FL',
    officeHours: null,
  });
});

describe('a data section carries the anchor the page gives it', () => {
  it('meetings', async () => {
    expect(await sectionIds(MeetingsBlock(props('meetings', {}, 'meetings')))).toEqual(['meetings']);
    expect(await sectionIds(MeetingsBlock(props('meetings', {})))).toEqual([null]);
  });

  it('announcements', async () => {
    expect(
      await sectionIds(AnnouncementsBlock(props('announcements', {}, 'announcements'))),
    ).toEqual(['announcements']);
    expect(await sectionIds(AnnouncementsBlock(props('announcements', {})))).toEqual([null]);
  });

  it('contact', async () => {
    expect(await sectionIds(ContactBlock(props('contact', {}, 'contact')))).toEqual(['contact']);
    expect(await sectionIds(ContactBlock(props('contact', {})))).toEqual([null]);
  });

  it('documents puts it on the list when there is one, and the summary below it gets none', async () => {
    const content = { includeCategories: ['budget'] };
    expect(await sectionIds(DocumentsBlock(props('documents', content, 'documents')))).toEqual([
      'documents',
      null,
    ]);
  });

  it("documents puts it on the owners' summary when that is all it shows", async () => {
    reader.listDocuments.mockResolvedValue([]);
    const content = { includeCategories: ['budget'] };
    expect(await sectionIds(DocumentsBlock(props('documents', content, 'documents')))).toEqual([
      'documents',
    ]);
    expect(await sectionIds(DocumentsBlock(props('documents', content)))).toEqual([null]);
  });
});

describe('the editor canvas renders no anchors', () => {
  it('a view rendered without an anchor carries no id', () => {
    const { container } = render(
      <MeetingsBlockView blockId={7} content={{} as never} data={[MEETING]} community={community} />,
    );
    expect(container.querySelector('section')).not.toHaveAttribute('id');
  });
});
