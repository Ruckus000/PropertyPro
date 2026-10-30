/**
 * Board members (D16): the people who hold board seats, by name and title.
 *
 * The roster is `getContactInfo`'s board list, which reads the seat holders'
 * designations. Display only: nothing here may widen into contact details, and
 * an empty roster renders nothing on the live site.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BoardBlock } from '@/components/public-site/blocks/BoardBlock';
import { BoardBlockView } from '@/components/public-site/blocks/BoardBlockView';
import type { BlockRendererProps, PublicCommunity } from '@/components/public-site/blocks/types';
import type { PublicContactInfo } from '@/lib/db/public-community-reader';

const reader = vi.hoisted(() => ({
  getContactInfo: vi.fn(),
  listMeetings: vi.fn(),
  listAnnouncements: vi.fn(),
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => reader,
}));

const community: PublicCommunity = {
  id: 42,
  slug: 'harbor-pointe',
  name: 'Harbor Pointe Condominium Association',
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

const BOARD = [
  { name: 'Maria Delgado', title: 'Board President' },
  { name: 'Robert Chen', title: 'Treasurer' },
];

function contactInfo(overrides: Partial<PublicContactInfo> = {}): PublicContactInfo {
  return { management: null, board: [], address: null, officeHours: null, ...overrides };
}

function makeProps(content: unknown = {}, extra: Partial<BlockRendererProps> = {}): BlockRendererProps {
  return {
    block: { id: 8, blockType: 'board', blockOrder: 5, content },
    community,
    theme,
    layout: 'tidewater',
    ...extra,
  };
}

async function renderShell(props: BlockRendererProps) {
  const ui = await BoardBlock(props);
  return { ui, ...render(<>{ui}</>) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<BoardBlock> shell', () => {
  it('board lists names and titles and never an email', async () => {
    // As if the reader ignored the management switch, or the roster rows grew
    // contact fields: neither may reach this section.
    reader.getContactInfo.mockResolvedValue(
      contactInfo({
        management: { name: 'Acme Management', email: 'office@acme.test', phone: '305-555-0142' },
        board: [
          { ...BOARD[0]!, email: 'maria@harbor.test', phone: '305-555-0100' } as never,
          BOARD[1]!,
        ],
        address: '1450 Harbor Pointe Drive, Miami, FL',
      }),
    );
    const { ui, container } = await renderShell(makeProps());

    expect(reader.getContactInfo).toHaveBeenCalledWith({ showBoard: true, showManagement: false });
    // Only the two fields cross into the view, whatever the roster rows carry.
    expect((ui as React.ReactElement<{ data: unknown }>).props.data).toEqual({ members: BOARD });
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Maria DelgadoBoard President',
      'Robert ChenTreasurer',
    ]);
    expect(container.textContent).not.toMatch(/@/);
    expect(container.textContent).not.toContain('555');
    expect(container.textContent).not.toContain('Acme Management');
    expect(container.textContent).not.toContain('Harbor Pointe Drive');
    expect(container.querySelector('a')).toBeNull();
  });

  it('board renders nothing when no one holds a seat', async () => {
    reader.getContactInfo.mockResolvedValue(
      contactInfo({
        management: { name: 'Acme Management', email: 'office@acme.test', phone: null },
        address: '1450 Harbor Pointe Drive, Miami, FL',
      }),
    );
    const { ui, container } = await renderShell(makeProps());

    expect(ui).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('is headed "Board of Directors" unless the section names itself', async () => {
    reader.getContactInfo.mockResolvedValue(contactInfo({ board: BOARD }));

    const first = await renderShell(makeProps());
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Board of Directors');
    first.unmount();

    await renderShell(makeProps({ heading: 'Your board' }));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Your board');
  });

  it('carries the anchor id the page gives it, and none otherwise', async () => {
    reader.getContactInfo.mockResolvedValue(contactInfo({ board: BOARD }));

    const anchored = await renderShell(makeProps({}, { anchorId: 'board' }));
    expect(anchored.container.querySelector('section')).toHaveAttribute('id', 'board');
    anchored.unmount();

    const plain = await renderShell(makeProps());
    expect(plain.container.querySelector('section')).not.toHaveAttribute('id');
  });

  it('renders nothing and warns when its content fails the schema', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ui } = await renderShell(makeProps({ members: [{ name: 'Someone' }] }));

    expect(ui).toBeNull();
    expect(reader.getContactInfo).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('board block content'),
      expect.anything(),
    );
    warn.mockRestore();
  });
});

describe('<BoardBlockView>', () => {
  it('names the list by its heading for assistive tech', () => {
    render(
      <BoardBlockView blockId={8} content={{}} data={{ members: BOARD }} community={community} />,
    );
    const region = screen.getByRole('region', { name: 'Board of Directors' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(2);
  });

  it('keeps a placeholder for the editor canvas when no one holds a seat', () => {
    // The live site never reaches this: the shell renders nothing first.
    render(<BoardBlockView blockId={8} content={{}} data={{ members: [] }} community={community} />);
    expect(screen.getByText('No one holds a board seat yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
