import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentsBlock } from '@/components/public-site/blocks/DocumentsBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const listDocumentsMock = vi.fn();
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listAnnouncements: vi.fn(),
    listDocuments: listDocumentsMock,
    listMeetings: vi.fn(),
    listSiteBlocks: vi.fn(),
    getContactInfo: vi.fn(),
  }),
}));

const community = {
  id: 42,
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
  return { block: { id: 3, blockType: 'documents', blockOrder: 3, content }, community, theme, layout: 'tidewater' };
}

describe('<DocumentsBlock>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the empty state when no documents match the category filter', async () => {
    listDocumentsMock.mockResolvedValueOnce([]);
    const ui = await DocumentsBlock(makeProps({ limit: 5, includeCategories: ['budget'] }));
    render(ui as React.ReactElement);
    expect(screen.getByText(/No documents available/i)).toBeInTheDocument();
  });

  it('renders a list of documents with title and download link', async () => {
    listDocumentsMock.mockResolvedValueOnce([
      {
        id: 1,
        title: 'Budget 2025',
        description: 'Annual budget report',
        filePath: '42/documents/budget-2025.pdf',
        fileName: 'budget-2025.pdf',
        categoryName: 'budget',
        createdAt: new Date('2026-01-15T10:00:00Z'),
      },
    ]);
    const ui = await DocumentsBlock(makeProps({ limit: 5, includeCategories: ['budget'] }));
    render(ui as React.ReactElement);
    expect(screen.getByText('Budget 2025')).toBeInTheDocument();
    expect(screen.getByText('Annual budget report')).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', { name: /Download Budget 2025/i });
    expect(downloadLink).toHaveAttribute(
      'href',
      '/api/v1/public/documents/1/download?communityId=42',
    );
  });

  it('shows the category name badge when present', async () => {
    listDocumentsMock.mockResolvedValueOnce([
      {
        id: 2,
        title: 'Meeting Minutes',
        description: null,
        filePath: '42/documents/minutes.pdf',
        fileName: 'minutes.pdf',
        categoryName: 'minutes',
        createdAt: new Date('2026-02-01T10:00:00Z'),
      },
    ]);
    const ui = await DocumentsBlock(makeProps({ limit: 5, includeCategories: ['minutes'] }));
    render(ui as React.ReactElement);
    expect(screen.getByText('minutes')).toBeInTheDocument();
  });

  it('calls listDocuments with parsed limit + includeCategories', async () => {
    listDocumentsMock.mockResolvedValueOnce([]);
    await DocumentsBlock(makeProps({ limit: 10, includeCategories: ['rules', 'other'] }));
    expect(listDocumentsMock).toHaveBeenCalledWith({
      limit: 10,
      includeCategories: ['rules', 'other'],
    });
  });

  it('emits console.warn + renders null on invalid config', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await DocumentsBlock(makeProps({ limit: 999 })); // out of range
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('documents block content'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('renders empty state when no includeCategories are configured (returns [])', async () => {
    listDocumentsMock.mockResolvedValueOnce([]);
    const ui = await DocumentsBlock(makeProps({ limit: 5 }));
    render(ui as React.ReactElement);
    expect(screen.getByText(/No documents available/i)).toBeInTheDocument();
    expect(listDocumentsMock).toHaveBeenCalledWith({ limit: 5, includeCategories: undefined });
  });

  it('falls back gracefully when community.timezone is invalid', async () => {
    listDocumentsMock.mockResolvedValueOnce([
      { id: 9, title: 'Doc', description: null, filePath: '42/x.pdf', fileName: 'x.pdf', categoryName: 'rules', createdAt: new Date('2026-01-15T10:00:00Z') },
    ]);
    const props = { ...makeProps({ limit: 5, includeCategories: ['rules'] }), community: { ...community, timezone: 'Not/A_Real_Zone' } };
    const ui = await DocumentsBlock(props);
    expect(() => render(ui as React.ReactElement)).not.toThrow();
  });
});
