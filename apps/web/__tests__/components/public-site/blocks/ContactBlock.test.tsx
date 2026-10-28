import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContactBlock } from '@/components/public-site/blocks/ContactBlock';
import { ContactBlockView } from '@/components/public-site/blocks/ContactBlockView';
import type { BlockRendererProps, PublicCommunity } from '@/components/public-site/blocks/types';
import type { PublicContactInfo } from '@/lib/db/public-community-reader';

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

const community: PublicCommunity = {
  id: 1,
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

function makeProps(content: unknown): BlockRendererProps {
  return { block: { id: 7, blockType: 'contact', blockOrder: 7, content }, community, theme, layout: 'tidewater' };
}

/** What `getContactInfo` returns when the community has given us nothing. */
function contactInfo(overrides: Partial<PublicContactInfo> = {}): PublicContactInfo {
  return { management: null, board: [], address: null, officeHours: null, ...overrides };
}

const BOTH = { showBoard: true, showManagement: true };

describe('<ContactBlock>', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders management contact and board roster', async () => {
    getContactInfoMock.mockResolvedValueOnce(
      contactInfo({
        management: { name: 'Jane Manager', email: 'jane@example.com', phone: '555-0100' },
        board: [{ name: 'Sam President', title: 'Board President' }],
      }),
    );
    const ui = await ContactBlock(makeProps(BOTH));
    render(ui as React.ReactElement);
    expect(screen.getByText('Management')).toBeInTheDocument();
    expect(screen.getByText('Jane Manager')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'jane@example.com' })).toHaveAttribute('href', 'mailto:jane@example.com');
    expect(screen.getByText('Sam President')).toBeInTheDocument();
    expect(screen.getByText('Board President')).toBeInTheDocument();
  });

  it('passes visibility options through to getContactInfo', async () => {
    getContactInfoMock.mockResolvedValueOnce(contactInfo());
    await ContactBlock(makeProps({ showBoard: false, showManagement: true }));
    expect(getContactInfoMock).toHaveBeenCalledWith({ showBoard: false, showManagement: true });
  });

  it('renders nothing when the community has given us no contact details at all', async () => {
    // D14: the live site never shows an empty box. The editor canvas renders
    // the view directly and keeps its placeholder (see the last describe).
    getContactInfoMock.mockResolvedValueOnce(contactInfo());
    const ui = await ContactBlock(makeProps(BOTH));
    const { container } = render(ui as React.ReactElement);

    expect(ui).toBeNull();
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Contact information will be posted here soon/i)).toBeNull();
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

describe('<ContactBlock> — what the Community profile adds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('contact shows office hours when set and leaves out the row when not', async () => {
    getContactInfoMock.mockResolvedValueOnce(
      contactInfo({
        management: { name: 'Jane Manager', email: null, phone: null },
        officeHours: 'Mon-Fri, 9-5',
      }),
    );
    const withHours = render((await ContactBlock(makeProps(BOTH))) as React.ReactElement);

    expect(screen.getByText('Office hours')).toBeInTheDocument();
    expect(screen.getByText('Mon-Fri, 9-5')).toBeInTheDocument();
    withHours.unmount();

    // Nothing in the profile: no label with an empty value after it, and no
    // invented hours in their place. A blank string is "not set", like null.
    for (const officeHours of [null, '', '   ']) {
      getContactInfoMock.mockResolvedValueOnce(
        contactInfo({
          management: { name: 'Jane Manager', email: null, phone: null },
          officeHours,
        }),
      );
      const without = render((await ContactBlock(makeProps(BOTH))) as React.ReactElement);

      expect(screen.getByText('Jane Manager')).toBeInTheDocument();
      expect(screen.queryByText('Office hours')).toBeNull();
      without.unmount();
    }
  });

  it('contact shows the address when present and leaves out the row when not', async () => {
    // The address alone is enough to render the section: no hours, no management,
    // no board.
    getContactInfoMock.mockResolvedValueOnce(
      contactInfo({ address: '100 Palm Way, Suite 4, Miami, FL 33101' }),
    );
    const withAddress = render((await ContactBlock(makeProps(BOTH))) as React.ReactElement);

    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('100 Palm Way, Suite 4, Miami, FL 33101')).toBeInTheDocument();
    expect(screen.queryByText('Office hours')).toBeNull();
    withAddress.unmount();

    // Hours alone are enough too, and then there is no Address row.
    getContactInfoMock.mockResolvedValueOnce(contactInfo({ officeHours: 'Mon-Fri, 9-5' }));
    render((await ContactBlock(makeProps(BOTH))) as React.ReactElement);

    expect(screen.queryByText('Address')).toBeNull();
    expect(screen.getByText('Mon-Fri, 9-5')).toBeInTheDocument();
  });

  it('contact renders no email link when the contact email is empty', async () => {
    // `communities.contact_email` is the only address this section may show. When
    // it is empty there is no link and no "Email" label, and the rest of the
    // management card is untouched.
    for (const email of ['', '   ', null]) {
      getContactInfoMock.mockResolvedValueOnce(
        contactInfo({ management: { name: 'Jane Manager', email, phone: '555-0100' } }),
      );
      const { container, unmount } = render(
        (await ContactBlock(makeProps(BOTH))) as React.ReactElement,
      );

      expect(screen.getByText('Jane Manager')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '555-0100' })).toHaveAttribute('href', 'tel:555-0100');
      expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
      expect(screen.queryByText('Email')).toBeNull();
      unmount();
    }
  });

  it('contact shows the address and hours even when the management contact is switched off', async () => {
    // Switching the management contact off hides a person's details. The
    // association's own address and hours are not those.
    getContactInfoMock.mockResolvedValueOnce(
      contactInfo({ address: '100 Palm Way, Miami, FL 33101', officeHours: 'Mon-Fri, 9-5' }),
    );
    render((await ContactBlock(makeProps({ showBoard: false, showManagement: false }))) as React.ReactElement);

    expect(screen.getByText('100 Palm Way, Miami, FL 33101')).toBeInTheDocument();
    expect(screen.getByText('Mon-Fri, 9-5')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Management contact' })).toBeNull();
  });

  it('contact still renders for a board with no other details (showBoard is unchanged)', async () => {
    getContactInfoMock.mockResolvedValueOnce(
      contactInfo({ board: [{ name: 'Sam President', title: 'Board President' }] }),
    );
    const ui = await ContactBlock(makeProps(BOTH));
    render(ui as React.ReactElement);

    expect(ui).not.toBeNull();
    expect(screen.getByRole('region', { name: 'Board roster' })).toBeInTheDocument();
    expect(screen.getByText('Sam President')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Office' })).toBeNull();
  });

  it('contact renders nothing when the only management details are blank', async () => {
    // A stored blank is not a contact: no empty "Management" card.
    getContactInfoMock.mockResolvedValueOnce(
      contactInfo({ management: { name: '  ', email: '', phone: null } }),
    );
    const ui = await ContactBlock(makeProps(BOTH));

    expect(ui).toBeNull();
  });
});

describe('the editor canvas still explains an empty Contact section', () => {
  it('ContactBlockView keeps its placeholder when it is given nothing', () => {
    // The canvas renders the pure view, not the shell above, so a manager editing
    // an empty Contact section still sees where it sits. D14 must not reach it.
    render(<ContactBlockView blockId={7} content={{ showBoard: true, showManagement: true }} data={contactInfo()} community={community} />);

    expect(screen.getByText('Contact information will be posted here soon.')).toBeInTheDocument();
  });
});
