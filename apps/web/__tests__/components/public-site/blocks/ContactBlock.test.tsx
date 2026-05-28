import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactBlock } from '@/components/public-site/blocks/ContactBlock';
import type { BlockRendererProps } from '@/components/public-site/blocks/types';

const getContactInfoMock = vi.fn();
vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listAnnouncements: vi.fn(),
    listDocuments: vi.fn(),
    listMeetings: vi.fn(),
    listSiteBlocks: vi.fn(),
    getContactInfo: getContactInfoMock,
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
  return { block: { id: 7, blockType: 'contact', blockOrder: 7, content }, community, theme, layout: 'tidewater' };
}

describe('<ContactBlock>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders management contact and board roster', async () => {
    getContactInfoMock.mockResolvedValueOnce({
      management: { name: 'Jane Manager', email: 'jane@example.com', phone: '555-0100' },
      board: [{ name: 'Sam President', title: 'Board President' }],
    });
    const ui = await ContactBlock(makeProps({ showBoard: true, showManagement: true }));
    render(ui as React.ReactElement);
    expect(screen.getByText('Management')).toBeInTheDocument();
    expect(screen.getByText('Jane Manager')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'jane@example.com' })).toHaveAttribute('href', 'mailto:jane@example.com');
    expect(screen.getByText('Sam President')).toBeInTheDocument();
    expect(screen.getByText('Board President')).toBeInTheDocument();
  });

  it('passes visibility options through to getContactInfo', async () => {
    getContactInfoMock.mockResolvedValueOnce({ management: null, board: [] });
    await ContactBlock(makeProps({ showBoard: false, showManagement: true }));
    expect(getContactInfoMock).toHaveBeenCalledWith({ showBoard: false, showManagement: true });
  });

  it('renders an empty state when no contact rows are available', async () => {
    getContactInfoMock.mockResolvedValueOnce({ management: null, board: [] });
    const ui = await ContactBlock(makeProps({ showBoard: true, showManagement: true }));
    render(ui as React.ReactElement);
    expect(screen.getByText(/Contact information will be posted here soon/i)).toBeInTheDocument();
  });

  it('emits console.warn + renders null on invalid config', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await ContactBlock(makeProps({ showBoard: true, extra: true }));
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('contact block content'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });
});
