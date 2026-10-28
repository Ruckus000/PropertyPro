/**
 * Empty data sections (D14).
 *
 * A data section with nothing in it is left out of the live site, and the
 * Documents section tells visitors where the owners' records are instead of
 * "No documents available."
 *
 * The rule lives in the async SHELLS, which the public page renders. The pure
 * `*BlockView`s are untouched: the editor canvas renders those, and a manager
 * editing an empty section needs the placeholder to see where it sits. Both
 * halves are pinned here so neither drifts into the other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { AnnouncementsBlock } from '@/components/public-site/blocks/AnnouncementsBlock';
import { AnnouncementsBlockView } from '@/components/public-site/blocks/AnnouncementsBlockView';
import { DocumentsBlock } from '@/components/public-site/blocks/DocumentsBlock';
import { DocumentsBlockView } from '@/components/public-site/blocks/DocumentsBlockView';
import { MeetingsBlock } from '@/components/public-site/blocks/MeetingsBlock';
import { MeetingsBlockView } from '@/components/public-site/blocks/MeetingsBlockView';
import { OwnerRecordsSummary } from '@/components/public-site/blocks/OwnerRecordsSummary';
import type { BlockRendererProps, PublicCommunity } from '@/components/public-site/blocks/types';

const reader = vi.hoisted(() => ({
  listAnnouncements: vi.fn(),
  listDocuments: vi.fn(),
  listMeetings: vi.fn(),
  listOwnerRecordGroups: vi.fn(),
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => reader,
}));

// The announcements shell sanitizes through isomorphic-dompurify, which drags
// jsdom in; a passthrough keeps this file about emptiness, not sanitizing.
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

function props(blockType: BlockRendererProps['block']['blockType'], content: unknown): BlockRendererProps {
  return { block: { id: 7, blockType, blockOrder: 3, content }, community, theme, layout: 'tidewater' };
}

const FINANCIAL_GROUP = { category: 'financial_records', label: 'Financial records', postedCount: 3 };
const GOVERNING_GROUP = { category: 'governing_documents', label: 'Governing documents', postedCount: 5 };

const PUBLIC_DOCUMENT = {
  id: 1,
  title: 'Budget 2025',
  description: null,
  filePath: '42/documents/budget-2025.pdf',
  fileName: 'budget-2025.pdf',
  categoryName: 'budget',
  createdAt: new Date('2026-01-15T10:00:00Z'),
};

describe('empty data sections are left out of the live site', () => {
  beforeEach(() => vi.clearAllMocks());

  it('meetings section renders nothing when no meeting is upcoming', async () => {
    reader.listMeetings.mockResolvedValueOnce([]);

    const ui = await MeetingsBlock(props('meetings', { limit: 10, timeWindowDays: 30 }));
    const { container } = render(ui as React.ReactElement);

    expect(ui).toBeNull();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('No upcoming meetings.')).toBeNull();
  });

  it('announcements section renders nothing when there are none', async () => {
    reader.listAnnouncements.mockResolvedValueOnce([]);

    const ui = await AnnouncementsBlock(props('announcements', { limit: 5, timeWindowDays: 30 }));
    const { container } = render(ui as React.ReactElement);

    expect(ui).toBeNull();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('No announcements yet.')).toBeNull();
  });
});

describe('the public Documents section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reader.listDocuments.mockResolvedValue([]);
    reader.listOwnerRecordGroups.mockResolvedValue([]);
  });

  const documentsProps = () => props('documents', { limit: 5, includeCategories: ['budget'] });

  it('documents section shows the owners\' summary, never "No documents available."', async () => {
    reader.listOwnerRecordGroups.mockResolvedValue([FINANCIAL_GROUP]);

    const ui = await DocumentsBlock(documentsProps());
    render(ui as React.ReactElement);

    expect(screen.queryByText('No documents available.')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Association documents' })).toBeInTheDocument();
    expect(
      screen.getByText("Owners can sign in to see the association's official records."),
    ).toBeInTheDocument();
    expect(screen.getByText('Financial records · 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Owner sign in' })).toHaveAttribute('href', '/auth/login');
    // The empty list's own section ("Documents" + its placeholder) is not rendered.
    expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull();
  });

  it('documents section lists public documents and the owners\' summary together', async () => {
    reader.listDocuments.mockResolvedValue([PUBLIC_DOCUMENT]);
    reader.listOwnerRecordGroups.mockResolvedValue([FINANCIAL_GROUP, GOVERNING_GROUP]);

    const ui = await DocumentsBlock(documentsProps());
    render(ui as React.ReactElement);

    expect(screen.getByText('Budget 2025')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download Budget 2025/i })).toHaveAttribute(
      'href',
      '/api/v1/public/documents/1/download?communityId=42',
    );
    expect(screen.getByText('Financial records · 3')).toBeInTheDocument();
    expect(screen.getByText('Governing documents · 5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Owner sign in' })).toHaveAttribute('href', '/auth/login');
    // Sibling sections, the list first and the summary below it.
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Documents',
      'Association documents',
    ]);
  });

  it('documents section lists public documents with no summary when no record is posted', async () => {
    reader.listDocuments.mockResolvedValue([PUBLIC_DOCUMENT]);

    const ui = await DocumentsBlock(documentsProps());
    render(ui as React.ReactElement);

    expect(screen.getByText('Budget 2025')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Association documents' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Owner sign in' })).toBeNull();
  });

  it('documents section renders nothing when nothing is public and nothing is posted', async () => {
    const ui = await DocumentsBlock(documentsProps());
    const { container } = render(ui as React.ReactElement);

    // D14: the shell returns null, not an empty fragment.
    expect(ui).toBeNull();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('No documents available.')).toBeNull();
  });

  it('documents section treats groups with no posted record as nothing posted', async () => {
    reader.listOwnerRecordGroups.mockResolvedValue([{ ...FINANCIAL_GROUP, postedCount: 0 }]);

    const ui = await DocumentsBlock(documentsProps());
    const { container } = render(ui as React.ReactElement);

    expect(ui).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('documents section reads the records summary even when no categories are configured', async () => {
    reader.listOwnerRecordGroups.mockResolvedValue([FINANCIAL_GROUP]);

    const ui = await DocumentsBlock(props('documents', { limit: 5 }));
    render(ui as React.ReactElement);

    expect(screen.getByText('Financial records · 3')).toBeInTheDocument();
  });
});

describe('the editor canvas still explains an empty section', () => {
  // The canvas renders the pure views, not the shells, so the placeholder text
  // is how a manager sees an empty section there. D14 must not reach it.
  it('MeetingsBlockView still shows its empty text in the editor canvas', () => {
    render(
      <MeetingsBlockView
        blockId={7}
        content={{ limit: 10, timeWindowDays: 30 }}
        data={[]}
        community={community}
      />,
    );

    expect(screen.getByText('No upcoming meetings.')).toBeInTheDocument();
  });

  it('AnnouncementsBlockView still shows its empty text in the editor canvas', () => {
    render(
      <AnnouncementsBlockView
        blockId={7}
        content={{ limit: 5, timeWindowDays: 30 }}
        data={[]}
        community={community}
      />,
    );

    expect(screen.getByText('No announcements yet.')).toBeInTheDocument();
  });

  it('DocumentsBlockView still shows its empty text in the editor canvas', () => {
    render(
      <DocumentsBlockView
        blockId={7}
        content={{ limit: 5, includeCategories: ['budget'] }}
        data={[]}
        community={community}
      />,
    );

    expect(screen.getByText('No documents available.')).toBeInTheDocument();
  });
});

describe('<OwnerRecordsSummary>', () => {
  it('names each group with its count, in the order given, and skips a group with none', () => {
    render(
      <OwnerRecordsSummary
        groups={[
          { label: 'Governing documents', postedCount: 5 },
          { label: 'Meeting records', postedCount: 0 },
          { label: 'Financial records', postedCount: 1 },
        ]}
      />,
    );

    const rows = screen.getAllByRole('listitem').map((row) => row.textContent);
    expect(rows).toEqual(['Governing documents · 5', 'Financial records · 1']);
    expect(screen.queryByText(/Meeting records/)).toBeNull();
  });

  it('is a section of its own with a level-two heading, like the block views', () => {
    const { container } = render(
      <OwnerRecordsSummary blockId={7} groups={[{ label: 'Insurance', postedCount: 2 }]} />,
    );

    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    const heading = within(section as HTMLElement).getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Association documents');
    // The region is named by its own heading, and the id is per block so a
    // page with two Documents sections does not repeat it.
    expect(section).toHaveAttribute('aria-labelledby', heading.id);
    expect(heading.id).toBe('owner-records-7');
  });

  it('renders without a block id, naming no region rather than pointing at a missing id', () => {
    const { container } = render(
      <OwnerRecordsSummary groups={[{ label: 'Insurance', postedCount: 2 }]} />,
    );

    expect(container.querySelector('section')).not.toHaveAttribute('aria-labelledby');
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveAttribute('id');
  });

  it('sends owners to sign in', () => {
    render(<OwnerRecordsSummary groups={[{ label: 'Insurance', postedCount: 2 }]} />);

    expect(screen.getByRole('link', { name: 'Owner sign in' })).toHaveAttribute('href', '/auth/login');
  });
});

describe("the owners' records summary — accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reader.listDocuments.mockResolvedValue([]);
    reader.listOwnerRecordGroups.mockResolvedValue([]);
  });

  it('has no axe violations on its own', async () => {
    const { container } = render(
      <OwnerRecordsSummary blockId={7} groups={[FINANCIAL_GROUP, GOVERNING_GROUP]} />,
    );

    // An empty container passes every axe rule there is; prove it rendered.
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations beside the public documents list', async () => {
    // Both sections point aria-labelledby at their own heading; a repeated id
    // between them is the thing this catches.
    reader.listDocuments.mockResolvedValue([PUBLIC_DOCUMENT]);
    reader.listOwnerRecordGroups.mockResolvedValue([FINANCIAL_GROUP]);

    const ui = await DocumentsBlock(props('documents', { limit: 5, includeCategories: ['budget'] }));
    const { container } = render(ui as React.ReactElement);

    expect(container.querySelectorAll('section')).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });
});
