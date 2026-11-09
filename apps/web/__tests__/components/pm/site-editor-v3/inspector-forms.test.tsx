/**
 * The remaining Phase 9 inspector forms: layout variant (text/image/amenities)
 * and empty-state copy (announcements/documents/meetings); then the website
 * builder's writers: the Quick links and Board members forms, and the hero
 * form's "Shows as" line for linked fields.
 *
 * `TextForm.test.tsx` covers the shared autosave/reconciliation machinery, so
 * this file sticks to what each form adds: keyboard operation, the schema
 * rules each one mirrors, and the round-trip hazards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { documentsBlockSchema, type BlockType, type LinkedFacts } from '@propertypro/shared';
import { getLook } from '@/lib/site-looks/looks';
import { HeroBlock } from '@/components/public-site/blocks/HeroBlock';
import type { PublicCommunity } from '@/components/public-site/blocks/types';
import { ImageForm } from '@/components/pm/site-editor-v3/inspector/forms/ImageForm';
import { AmenitiesForm } from '@/components/pm/site-editor-v3/inspector/forms/AmenitiesForm';
import { SorEmptyTextForm } from '@/components/pm/site-editor-v3/inspector/forms/SorEmptyTextForm';
import { QuickLinksForm } from '@/components/pm/site-editor-v3/inspector/forms/QuickLinksForm';
import { BoardForm } from '@/components/pm/site-editor-v3/inspector/forms/BoardForm';
import { ContactForm } from '@/components/pm/site-editor-v3/inspector/forms/ContactForm';
import { HeroForm } from '@/components/pm/site-editor-v3/inspector/forms/HeroForm';
import { LinkedFactsProvider } from '@/components/pm/site-editor-v3/inspector/linked-facts-context';
import {
  SectionSourcesProvider,
  type ContactInfoLike,
  type OwnerRecordGroupCount,
} from '@/components/pm/site-editor-v3/inspector/section-sources-context';

/**
 * Renders a panel the way `EditorRoot` wires it: with the facts behind the
 * canvas that tell a section where its content comes from. Unset facts are
 * unknown, which is also what a panel outside a provider sees.
 */
function withSources(
  ui: React.ReactElement,
  sources: {
    layoutId?: string | null;
    contact?: ContactInfoLike | null;
    ownerRecordGroups?: readonly OwnerRecordGroupCount[] | null;
    recordsApply?: boolean;
  } = {},
) {
  return (
    <SectionSourcesProvider
      layoutId={sources.layoutId ?? null}
      contact={sources.contact ?? null}
      ownerRecordGroups={sources.ownerRecordGroups ?? null}
      recordsApply={sources.recordsApply ?? true}
    >
      {ui}
    </SectionSourcesProvider>
  );
}

const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  useUpsertContentBlock: () => ({ mutateAsync: upsertMock, isPending: false }),
}));

// The hero form writes through its own endpoint and its photo field reaches the
// upload queue; neither is under test here, only the form's own text.
const updateHeroMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-hero-block', () => ({
  useHeroBlock: () => ({ data: null }),
  useUpdateHeroBlock: () => ({ mutateAsync: updateHeroMock, isPending: false }),
}));
vi.mock('@/hooks/use-hero-photos', () => ({
  useHeroPhotos: () => ({ uploads: [], upload: vi.fn(), dismiss: vi.fn(), isUploading: false }),
}));

import { setupTimers, settleAutosave } from './autosave-harness';

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue(undefined);
  updateHeroMock.mockReset();
  updateHeroMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VariantField — keyboard operation', () => {
  it('is a radio group that arrow keys move through', async () => {
    const user = setupTimers();
    render(
      <ImageForm
        communityId={1}
        blockType="image"
        blockOrder={4}
        content={{ imagePath: '1/content/a.jpg', altText: 'A photo' }}
      />,
    );

    const group = screen.getByRole('group', { name: 'Width' });
    expect(group).toBeInTheDocument();
    // Absent variant normalises to standard, so the group is never
    // indeterminate.
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();

    // Focus the checked radio, then arrow. Roving focus within a radio group
    // is the platform behaviour a Radix Select would have had to reimplement.
    screen.getByRole('radio', { name: 'Standard' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('radio', { name: 'Wide' })).toBeChecked();
    await settleAutosave();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ variant: 'wide' }) }),
    );
  });

  it('omits the variant entirely when it is standard', async () => {
    // Writing `variant: 'standard'` would make two identical-looking sections
    // differ by content key and show as a spurious entry in the publish diff.
    const user = setupTimers();
    render(
      <ImageForm
        communityId={1}
        blockType="image"
        blockOrder={4}
        content={{ imagePath: '1/content/a.jpg', altText: 'A photo', variant: 'wide' }}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Standard' }));
    await settleAutosave();

    const sent = upsertMock.mock.calls.at(-1)![0].content as Record<string, unknown>;
    expect(sent).not.toHaveProperty('variant');
  });
});

describe('ImageForm — the alt/decorative rule', () => {
  it('blocks saving while a non-decorative image has no alt text', async () => {
    const user = setupTimers();
    render(
      <ImageForm
        communityId={1}
        blockType="image"
        blockOrder={4}
        content={{ imagePath: '1/content/a.jpg', altText: 'A photo' }}
      />,
    );

    await user.clear(screen.getByLabelText(/Alt text/));
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/mark it decorative/i)).toBeInTheDocument();
  });

  it('clears alt text when marked decorative, because the schema forbids both', async () => {
    const user = setupTimers();
    render(
      <ImageForm
        communityId={1}
        blockType="image"
        blockOrder={4}
        content={{ imagePath: '1/content/a.jpg', altText: 'A photo' }}
      />,
    );

    await user.click(screen.getByLabelText(/This image is decorative/));
    expect(screen.getByLabelText(/Alt text/)).toHaveValue('');
    expect(screen.getByLabelText(/Alt text/)).toBeDisabled();

    await settleAutosave();
    const sent = upsertMock.mock.calls.at(-1)![0].content as Record<string, unknown>;
    expect(sent).toEqual({ imagePath: '1/content/a.jpg', decorative: true });
    expect(sent).not.toHaveProperty('altText');
  });
});

describe('AmenitiesForm', () => {
  it('drops blank rows rather than sending an amenity with an empty name', async () => {
    const user = setupTimers();
    render(
      <AmenitiesForm
        communityId={1}
        blockType="amenities"
        blockOrder={5}
        content={{ items: [{ name: 'Pool' }] }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add amenity' }));
    await settleAutosave();

    // The new blank row must not reach the wire — `name` is min(1). A FULLY
    // blank row is the transient state right after "Add amenity", so it is
    // dropped silently rather than blocking the save.
    const sent = upsertMock.mock.calls.at(-1)?.[0]?.content as
      | Record<string, unknown>
      | undefined;
    // Either nothing was written (canonical unchanged) or exactly Pool was.
    if (sent) expect(sent.items).toEqual([{ name: 'Pool' }]);
    expect(screen.queryByText(/has a description but no name/)).not.toBeInTheDocument();
  });

  it('blocks saving when every row is blank', async () => {
    const user = setupTimers();
    render(
      <AmenitiesForm
        communityId={1}
        blockType="amenities"
        blockOrder={5}
        content={{ items: [{ name: 'Pool' }] }}
      />,
    );

    await user.clear(screen.getByLabelText('Name'));
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Name at least one amenity/i)).toBeInTheDocument();
  });

  it('labels each remove button by position', () => {
    render(
      <AmenitiesForm
        communityId={1}
        blockType="amenities"
        blockOrder={5}
        content={{ items: [{ name: 'Pool' }, { name: 'Gym' }] }}
      />,
    );
    // "Remove" repeated down a list is useless in a screen reader's element
    // list.
    expect(screen.getByRole('button', { name: 'Remove amenity 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove amenity 2' })).toBeInTheDocument();
  });

  it('blocks the save and names the row when a description has no name', async () => {
    // REGRESSION. `toCanonical` used to filter out any row whose name was
    // empty, so a PM who cleared a name to retype it — or typed a description
    // first — had that amenity silently deleted from the stored content while
    // the form carried on showing it.
    const user = setupTimers();
    render(
      <AmenitiesForm
        communityId={1}
        blockType="amenities"
        blockOrder={5}
        content={{ items: [{ name: 'Pool' }, { name: 'Gym', description: 'Open 24h' }] }}
      />,
    );

    const names = screen.getAllByLabelText('Name');
    await user.clear(names[1]!);
    await settleAutosave();

    // Nothing written, and the message points at the offending row.
    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Amenity 2 has a description but no name/)).toBeInTheDocument();
  });

  it('saves again once the nameless row is given a name', async () => {
    const user = setupTimers();
    render(
      <AmenitiesForm
        communityId={1}
        blockType="amenities"
        blockOrder={5}
        content={{ items: [{ name: 'Pool' }, { name: 'Gym', description: 'Open 24h' }] }}
      />,
    );

    const names = screen.getAllByLabelText('Name');
    await user.clear(names[1]!);
    await user.type(names[1]!, 'Fitness centre');
    await settleAutosave();

    const sent = upsertMock.mock.calls.at(-1)![0].content as Record<string, unknown>;
    expect(sent.items).toEqual([
      { name: 'Pool' },
      { name: 'Fitness centre', description: 'Open 24h' },
    ]);
  });
});

describe('SorEmptyTextForm', () => {
  it('writes the override and keeps the rest of the block config intact', async () => {
    // The hazard: a save writes the WHOLE content object. If the untouched
    // fields were dropped, editing the empty-state copy would silently reset
    // a PM's configured limit and window to the schema defaults.
    const user = setupTimers();
    render(
      <SorEmptyTextForm
        communityId={1}
        blockType="announcements"
        blockOrder={6}
        content={{ limit: 12, timeWindowDays: 90 }}
      />,
    );

    await user.type(screen.getByLabelText('Empty-state message'), 'Check back soon.');
    await settleAutosave();

    expect(upsertMock).toHaveBeenCalledWith({
      blockType: 'announcements',
      blockOrder: 6,
      content: { limit: 12, timeWindowDays: 90, emptyText: 'Check back soon.' },
    });
  });

  it('omits the override when cleared, so the built-in copy returns', async () => {
    const user = setupTimers();
    render(
      <SorEmptyTextForm
        communityId={1}
        blockType="meetings"
        blockOrder={6}
        content={{ limit: 10, emptyText: 'Custom.' }}
      />,
    );

    await user.clear(screen.getByLabelText('Empty-state message'));
    await settleAutosave();

    const sent = upsertMock.mock.calls.at(-1)![0].content as Record<string, unknown>;
    expect(sent).toEqual({ limit: 10 });
    expect(sent).not.toHaveProperty('emptyText');
  });

  it('previews the built-in copy as the placeholder for the block type', () => {
    render(
      <SorEmptyTextForm
        communityId={1}
        blockType="documents"
        blockOrder={6}
        content={{ limit: 5 }}
      />,
    );
    expect(screen.getByLabelText('Empty-state message')).toHaveAttribute(
      'placeholder',
      'No documents available.',
    );
  });

  describe('the hint says what the live site does with an empty section', () => {
    // The hint is the field's accessible description. The public shells render
    // nothing for an empty Meetings or Announcements section. A Documents
    // section shows the owners' records summary in its slot when any record is
    // posted, and hides itself only when none is. Either way the manager's
    // message is only ever seen on the editor canvas, and the hint must not
    // promise the website shows it.
    it("documents: the site shows the owners' summary in its place, or hides the section", () => {
      render(
        <SorEmptyTextForm
          communityId={1}
          blockType="documents"
          blockOrder={6}
          content={{ limit: 5 }}
        />,
      );
      // Ends at the closing quote: the built-in copy already ends in a full stop.
      expect(screen.getByLabelText('Empty-state message')).toHaveAccessibleDescription(
        "When there are no public documents to list, your website shows a summary of the owners' records here, or hides this section if there are none. This message only shows here in the editor. Leave blank to use “No documents available.”",
      );
    });

    it.each<[BlockType, string]>([
      ['meetings', 'No upcoming meetings.'],
      ['announcements', 'No announcements yet.'],
    ])('%s: the site hides the section while it is empty', (blockType, builtIn) => {
      render(
        <SorEmptyTextForm
          communityId={1}
          blockType={blockType}
          blockOrder={6}
          content={{ limit: 5 }}
        />,
      );
      expect(screen.getByLabelText('Empty-state message')).toHaveAccessibleDescription(
        `Your website hides this section while it has nothing to list. This message only shows here in the editor. Leave blank to use “${builtIn}”`,
      );
    });

    it('without built-in copy to quote: ends the sentence once', () => {
      // `faq` has no empty-state copy: the default wording, and the full stop
      // that the quoted copy would otherwise have supplied.
      render(
        <SorEmptyTextForm communityId={1} blockType="faq" blockOrder={6} content={{}} />,
      );
      expect(screen.getByLabelText('Empty-state message')).toHaveAccessibleDescription(
        'Your website hides this section while it has nothing to list. This message only shows here in the editor. Leave blank to use the default.',
      );
    });
  });
});

describe('QuickLinksForm', () => {
  function renderQuickLinks(content: unknown = {}) {
    return render(
      <QuickLinksForm communityId={1} blockType="quicklinks" blockOrder={4} content={content} />,
    );
  }
  const text = () => document.body.textContent ?? '';

  it('says the section fills itself in from meetings, announcements, documents and contact details', () => {
    renderQuickLinks();
    expect(text()).toMatch(/fills itself in/i);
    for (const source of ['meetings', 'announcements', 'owner documents', 'contact details']) {
      expect(text(), `names ${source}`).toMatch(new RegExp(source, 'i'));
    }
    // The page calls the announcements link "News".
    expect(text()).toMatch(/announcements \(shown as News\)/);
  });

  it('says a link shows only when its section is on the page and has something to show', () => {
    renderQuickLinks();
    expect(text()).toMatch(
      /a shortcut appears only when its section is on the page and has something to show/i,
    );
  });

  it('says the owner documents link always shows, and why', () => {
    // The one link that does not depend on a section: it is where owners sign in.
    renderQuickLinks();
    expect(text()).toMatch(/owner documents always appears, because it is where owners sign in/i);
  });

  it('has nothing to fill in', () => {
    renderQuickLinks();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('writes nothing, however long it stays open', async () => {
    setupTimers();
    renderQuickLinks({ hidden: true });
    await settleAutosave();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('BoardForm', () => {
  function renderBoard(content: unknown = {}) {
    return render(<BoardForm communityId={1} blockType="board" blockOrder={5} content={content} />);
  }
  const written = () => upsertMock.mock.calls.at(-1)![0] as {
    blockType: string;
    blockOrder: number;
    content: Record<string, unknown>;
  };

  it('shows the stored heading, with the default as the placeholder', () => {
    renderBoard({ heading: 'Your board' });
    const heading = screen.getByLabelText('Heading');
    expect(heading).toHaveValue('Your board');
    expect(heading).toHaveAttribute('placeholder', 'Board of Directors');
  });

  it('writes a typed heading to the board section', async () => {
    const user = setupTimers();
    renderBoard({});

    await user.type(screen.getByLabelText('Heading'), 'Your board');
    await settleAutosave();

    expect(upsertMock).toHaveBeenLastCalledWith({
      blockType: 'board',
      blockOrder: 5,
      content: { heading: 'Your board' },
    });
  });

  it('omits the heading when it is cleared, so the default returns', async () => {
    // `heading` is `.min(1)`: an empty string would be refused, and an absent key
    // is what makes the renderer keep "Board of Directors".
    const user = setupTimers();
    renderBoard({ heading: 'Your board' });

    await user.clear(screen.getByLabelText('Heading'));
    await settleAutosave();

    expect(written().content).toEqual({});
  });

  it('treats spaces alone as no heading, and trims the rest', async () => {
    const user = setupTimers();
    renderBoard({ heading: 'Your board' });

    await user.clear(screen.getByLabelText('Heading'));
    await user.type(screen.getByLabelText('Heading'), '   ');
    await settleAutosave();
    expect(written().content).toEqual({});

    await user.type(screen.getByLabelText('Heading'), 'Our officers  ');
    await settleAutosave();
    expect(written().content).toEqual({ heading: 'Our officers' });
  });

  it('keeps a hidden section hidden when its heading is edited', async () => {
    // `hidden` is set by the section list's eye toggle, not by this form, and a
    // save replaces the whole content.
    const user = setupTimers();
    renderBoard({ heading: 'Our board', hidden: true });

    await user.type(screen.getByLabelText('Heading'), '!');
    await settleAutosave();

    expect(written().content).toEqual({ heading: 'Our board!', hidden: true });
  });

  it('limits the heading to the 80 characters the section stores', () => {
    renderBoard({});
    expect(screen.getByLabelText('Heading')).toHaveAttribute('maxlength', '80');
  });

  it('says where the names and titles come from, and that no contact details are shown', () => {
    renderBoard({});
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/names and titles come from the board seats recorded in PropertyPro/i);
    expect(text).toMatch(/no contact details, such as email addresses or phone numbers, are shown/i);
  });

  it('says the website leaves the section out while no one holds a seat', () => {
    renderBoard({});
    expect(document.body.textContent).toMatch(
      /if no one holds a board seat yet, your website leaves this section out/i,
    );
  });

  it('tells the manager how to keep the board from appearing twice', () => {
    // The Contact section lists the board too, unless its own switch is off.
    renderBoard({});
    expect(
      screen.getByText(
        'If your Contact section also lists the board, untick “Show board members” there so the board appears only once.',
      ),
    ).toBeInTheDocument();
  });

  it('names a switch the Contact form really has', () => {
    const { unmount } = render(
      <ContactForm communityId={1} blockType="contact" blockOrder={3} content={{}} />,
    );
    expect(screen.getByLabelText('Show board members')).toBeInTheDocument();
    unmount();
  });
});

describe('HeroForm — the words as the page shows them', () => {
  const HARBOR: LinkedFacts = {
    name: 'Harbor Pointe Condominium Association, Inc.',
    shortName: 'Harbor Pointe',
    city: 'Miami',
    unitCount: 120,
  };

  function renderHero(
    content: unknown,
    facts: LinkedFacts | null = HARBOR,
    options: { layoutId?: string | null; variant?: 'full' | 'simple' } = {},
  ) {
    return render(
      <LinkedFactsProvider facts={facts}>
        {withSources(
          <HeroForm
            communityId={7}
            blockType="hero"
            blockOrder={1}
            content={content}
            variant={options.variant}
          />,
          { layoutId: options.layoutId ?? null },
        )}
      </LinkedFactsProvider>,
    );
  }
  const headline = () => screen.getByLabelText(/headline/i) as HTMLInputElement;
  const subtitle = () => screen.getByLabelText('Subtitle') as HTMLTextAreaElement;

  it('shows "Welcome to Harbor Pointe" for "Welcome to {{name}}", never the template', () => {
    renderHero({ headline: 'Welcome to {{name}}', subtitle: '{{units}} homes in {{city}}.' });
    expect(headline()).toHaveValue('Welcome to Harbor Pointe');
    expect(subtitle()).toHaveValue('120 homes in Miami.');
  });

  it('leaves out a sentence for a fact the community has not given, as the page does', () => {
    renderHero(
      {
        headline: 'Welcome',
        subtitle: '{{units}} homes in {{city}}. Meeting notices and records, all in one place.',
      },
      { ...HARBOR, city: null, unitCount: null },
    );
    expect(subtitle()).toHaveValue('Meeting notices and records, all in one place.');
  });

  it('shows the community name when the whole headline drops, as the page does', () => {
    renderHero({ headline: '{{city}}' }, { ...HARBOR, city: null });
    expect(headline()).toHaveValue('Harbor Pointe');
  });

  it('shows words with no detail in them exactly as stored', () => {
    renderHero({ headline: 'Welcome home', subtitle: 'Our own words.' });
    expect(headline()).toHaveValue('Welcome home');
    expect(subtitle()).toHaveValue('Our own words.');
  });

  it('shows the stored words when the community facts are not known', () => {
    renderHero({ headline: 'Welcome to {{name}}' }, null);
    expect(headline()).toHaveValue('Welcome to {{name}}');
  });

  it('shows a name holding markup or a token as plain text, and creates no element', () => {
    const { container } = renderHero(
      { headline: 'Welcome to {{name}}' },
      { ...HARBOR, shortName: null, name: '<b>Rose</b> {{city}} Court' },
    );
    expect(headline()).toHaveValue('Welcome to <b>Rose</b> {{city}} Court');
    expect(container.querySelector('b')).toBeNull();
  });

  it('saves what the manager sees once they type in a field', async () => {
    const user = setupTimers();
    renderHero({ headline: 'Welcome to {{name}}', subtitle: '{{units}} homes in {{city}}.' });

    await user.type(headline(), ' today');
    await settleAutosave();

    const sent = updateHeroMock.mock.calls.at(-1)![0];
    expect(sent.headline).toBe('Welcome to Harbor Pointe today');
    // The field nobody typed in keeps its details, so it still follows the profile.
    expect(sent.subtitle).toBe('{{units}} homes in {{city}}.');
  });

  // Guards the design rather than one line: the DRAFT keeps the stored words and
  // only the field shows them resolved. A form that resolved them into the draft
  // would save the community's name in place of `{{name}}` on any edit at all.
  it('keeps the stored details when something other than the words changes', async () => {
    const user = setupTimers();
    renderHero({ headline: 'Welcome to {{name}}', subtitle: '{{units}} homes in {{city}}.' });

    await user.type(screen.getByLabelText('Button label'), 'Sign in');
    await user.type(screen.getByLabelText('Button link'), '/auth/login');
    await settleAutosave();

    const sent = updateHeroMock.mock.calls.at(-1)![0];
    expect(sent.headline).toBe('Welcome to {{name}}');
    expect(sent.subtitle).toBe('{{units}} homes in {{city}}.');
  });

  it('offers no buttons that put a detail into the words', () => {
    renderHero({ headline: 'Welcome' });
    expect(
      screen.queryByRole('group', { name: 'Add a detail from your Community profile' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Insert the community name' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Shows as/)).not.toBeInTheDocument();
  });

  describe('matches the page', () => {
    // Worth having only if the field shows what the page shows. Rendered
    // through the real HeroBlock, so the two cannot drift apart unnoticed.
    function pageOf(content: unknown, facts: LinkedFacts) {
      const community: PublicCommunity = {
        id: 1,
        slug: 'harbor-pointe',
        name: facts.name,
        shortName: facts.shortName,
        logoUrl: null,
        communityType: 'condo_718',
        city: facts.city,
        state: 'FL',
        unitCount: facts.unitCount,
        timezone: 'America/New_York',
      };
      const view = render(
        <HeroBlock
          block={{ id: 1, blockType: 'hero', blockOrder: 1, content }}
          community={community}
          theme={{
            primaryColor: '#0e3338',
            secondaryColor: '#f6f1e6',
            accentColor: '#c66f49',
            headingFont: 'Fraunces',
            bodyFont: 'Manrope',
          }}
          layout="tidewater"
        />,
      );
      const shown = {
        headline: view.container.querySelector('h1')?.textContent ?? '',
        subtitle: view.container.querySelector('p')?.textContent ?? '',
      };
      view.unmount();
      return shown;
    }

    const WELCOME = 'Welcome to {{name}}';
    const COUNTED = '{{units}} homes in {{city}}. Notices for {{name}} here.';
    const CASES: [string, { headline: string; subtitle: string }, LinkedFacts][] = [
      ['every fact known', { headline: WELCOME, subtitle: COUNTED }, HARBOR],
      ['no city, no count', { headline: WELCOME, subtitle: COUNTED }, { ...HARBOR, city: null, unitCount: null }],
      ['no short name', { headline: '{{name}}', subtitle: 'The website of {{name}}.' }, { ...HARBOR, shortName: null }],
      ['headline drops whole', { headline: '{{city}}', subtitle: COUNTED }, { ...HARBOR, city: null }],
      ['subtitle drops whole', { headline: WELCOME, subtitle: '{{units}} homes.' }, { ...HARBOR, unitCount: null }],
      ['a name that ends in a full stop', { headline: '{{name}}.', subtitle: 'Home of {{name}}.' }, { ...HARBOR, shortName: null }],
      ['a name holding a token', { headline: WELCOME, subtitle: 'Home of {{name}}.' }, { ...HARBOR, shortName: null, name: 'Rose {{city}} Court' }],
    ];

    it.each(CASES)('%s', (_label, content, facts) => {
      const page = pageOf(content, facts);
      renderHero(content, facts);

      expect(headline()).toHaveValue(page.headline);
      expect(subtitle()).toHaveValue(page.subtitle);
    });
  });

  it('"Use the look\'s wording" restores the bayfront defaults, details and all', async () => {
    const user = setupTimers();
    renderHero({ headline: 'Our own words', subtitle: 'Something else.' }, HARBOR, {
      layoutId: 'bayfront',
    });

    await user.click(screen.getByRole('button', { name: "Use the look's wording" }));

    const bayfront = getLook('bayfront')!.sections.find((section) => section.blockType === 'hero')!
      .content as { headline: string; subtitle: string };
    // Shown as the page shows it…
    expect(headline()).toHaveValue('Welcome to Harbor Pointe');
    // …and saved with its details, so it follows the profile again.
    await settleAutosave();
    const sent = updateHeroMock.mock.calls.at(-1)![0];
    expect(sent.headline).toBe(bayfront.headline);
    expect(sent.subtitle).toBe(bayfront.subtitle);
  });

  it('keeps the button label, link and photos when the wording is restored', async () => {
    const user = setupTimers();
    renderHero(
      {
        headline: 'Our own words',
        ctaText: 'Sign in',
        ctaTarget: '/auth/login',
        photos: [{ stock: 'sunset', alt: 'A sunset over the water' }],
      },
      HARBOR,
      { layoutId: 'bayfront' },
    );

    await user.click(screen.getByRole('button', { name: "Use the look's wording" }));
    await settleAutosave();

    const sent = updateHeroMock.mock.calls.at(-1)![0];
    expect(sent.ctaText).toBe('Sign in');
    expect(sent.ctaTarget).toBe('/auth/login');
    expect(sent.photos).toEqual([{ stock: 'sunset', alt: 'A sunset over the water' }]);
  });

  it.each(['tidewater', 'boulevard', 'sable', null])(
    'has no look to go back to on the %s layout, so the button is not offered',
    (layoutId) => {
      renderHero({ headline: 'Our own words' }, HARBOR, { layoutId });
      expect(screen.queryByRole('button', { name: "Use the look's wording" })).not.toBeInTheDocument();
    },
  );

  describe('in Simple', () => {
    it('shows the words and photos only', () => {
      renderHero({ headline: 'Welcome to {{name}}' }, HARBOR, {
        layoutId: 'bayfront',
        variant: 'simple',
      });
      expect(headline()).toHaveValue('Welcome to Harbor Pointe');
      expect(subtitle()).toBeInTheDocument();
      expect(screen.queryByLabelText('Button label')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Button link')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: "Use the look's wording" })).not.toBeInTheDocument();
    });

    // The button is not offered here, but one set in Advanced must survive.
    it('keeps a button set in Advanced when the words change', async () => {
      const user = setupTimers();
      renderHero(
        { headline: 'Welcome', ctaText: 'Sign in', ctaTarget: '/auth/login' },
        HARBOR,
        { variant: 'simple' },
      );
      await user.type(headline(), '!');
      await settleAutosave();
      const sent = updateHeroMock.mock.calls.at(-1)![0];
      expect(sent.headline).toBe('Welcome!');
      expect(sent.ctaText).toBe('Sign in');
      expect(sent.ctaTarget).toBe('/auth/login');
    });
  });
});

describe('SorEmptyTextForm — the panels say where the content comes from', () => {
  const PROFILE_OWNER_GROUPS: OwnerRecordGroupCount[] = [
    { label: 'Budgets', postedCount: 3 },
    { label: 'Meeting minutes', postedCount: 2 },
  ];

  function renderSor(
    blockType: BlockType,
    content: unknown,
    sources: Parameters<typeof withSources>[1] = {},
    communityId = 7,
  ) {
    return render(
      withSources(
        <SorEmptyTextForm
          communityId={communityId}
          blockType={blockType}
          blockOrder={6}
          content={content}
        />,
        sources,
      ),
    );
  }
  const written = () => upsertMock.mock.calls.at(-1)![0] as {
    blockType: string;
    blockOrder: number;
    content: Record<string, unknown>;
  };

  it('the Announcements panel links to Announcements for this community', () => {
    renderSor('announcements', { limit: 3 });

    expect(document.body.textContent).toContain('Updates by itself from Announcements.');
    expect(screen.getByRole('link', { name: 'Announcements' })).toHaveAttribute(
      'href',
      '/announcements?communityId=7',
    );
    expect(screen.getByRole('link', { name: 'Write an announcement' })).toHaveAttribute(
      'href',
      '/announcements/new?communityId=7',
    );
  });

  it('links each panel to the community it is for', () => {
    renderSor('announcements', {}, {}, 31);
    expect(screen.getByRole('link', { name: 'Announcements' })).toHaveAttribute(
      'href',
      '/announcements?communityId=31',
    );
  });

  it('the Meetings panel links to Meetings, and has no announcement to write', () => {
    renderSor('meetings', { limit: 5 });

    expect(document.body.textContent).toContain('Updates by itself from Meetings.');
    expect(screen.getByRole('link', { name: 'Meetings' })).toHaveAttribute(
      'href',
      '/communities/7/meetings',
    );
    expect(screen.queryByRole('link', { name: 'Write an announcement' })).not.toBeInTheDocument();
  });

  it('the Documents panel writes includeCategories', async () => {
    const user = setupTimers();
    renderSor('documents', { limit: 5, includeCategories: ['budget'] });

    expect(screen.getByLabelText('Budgets')).toBeChecked();
    expect(screen.getByLabelText('Meeting minutes')).not.toBeChecked();

    await user.click(screen.getByLabelText('Meeting minutes'));
    await settleAutosave();

    expect(upsertMock).toHaveBeenCalledWith({
      blockType: 'documents',
      blockOrder: 6,
      content: { limit: 5, includeCategories: ['budget', 'minutes'] },
    });
    expect(documentsBlockSchema.safeParse(written().content).success).toBe(true);

    // Taking one away writes the rest, in the schema's order.
    await user.click(screen.getByLabelText('Budgets'));
    await settleAutosave();
    expect(written().content).toEqual({ limit: 5, includeCategories: ['minutes'] });
  });

  it('lists the categories in the schema order, whatever order they were checked in', async () => {
    const user = setupTimers();
    renderSor('documents', { limit: 5, includeCategories: ['rules'] });

    await user.click(screen.getByLabelText('Budgets'));
    await settleAutosave();

    expect(written().content.includeCategories).toEqual(['budget', 'rules']);
  });

  it('warns, with words, when no category is checked', async () => {
    const user = setupTimers();
    renderSor('documents', { limit: 5, includeCategories: ['budget'] });

    expect(screen.queryByText(/lists no documents/)).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Budgets'));

    expect(screen.getByText('Nothing is checked, so this section lists no documents.')).toBeInTheDocument();
  });

  it('writes no includeCategories while the block has none and only its message is edited', async () => {
    // A block saved before this panel has no key. Fixing its message must not add one.
    const user = setupTimers();
    renderSor('documents', { limit: 5 });

    expect(screen.getByText('Nothing is checked, so this section lists no documents.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Empty-state message'), 'None yet.');
    await settleAutosave();

    expect(written().content).toEqual({ limit: 5, emptyText: 'None yet.' });
  });

  it("the Documents panel links to Documents and summarises the owners' records", () => {
    renderSor(
      'documents',
      { limit: 5, includeCategories: ['budget'] },
      { ownerRecordGroups: PROFILE_OWNER_GROUPS },
    );

    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute(
      'href',
      '/communities/7/documents',
    );
    const records = screen.getByRole('heading', { name: 'Records for owners' }).parentElement!;
    expect(within(records).getByText('Budgets · 3')).toBeInTheDocument();
    expect(within(records).getByText('Meeting minutes · 2')).toBeInTheDocument();
    expect(
      within(records).getByRole('link', { name: 'See the records on your website home' }),
    ).toHaveAttribute('href', '/pm/website?communityId=7&tab=records');
  });

  it('says so when no record is posted for owners yet', () => {
    renderSor('documents', { limit: 5 }, { ownerRecordGroups: [] });
    expect(
      screen.getByText('No records for owners are posted yet, so your website has no summary to show.'),
    ).toBeInTheDocument();
  });

  it('says nothing about owners\' records for a community that owes no records list', () => {
    renderSor('documents', { limit: 5 }, { ownerRecordGroups: [], recordsApply: false });
    expect(screen.queryByRole('heading', { name: 'Records for owners' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /website home/ })).not.toBeInTheDocument();
  });
});

describe('ContactForm — what the Community profile still lacks', () => {
  function renderContact(
    contact: ContactInfoLike | null,
    content: unknown = { showBoard: true, showManagement: true },
  ) {
    return render(
      withSources(
        <ContactForm communityId={7} blockType="contact" blockOrder={3} content={content} />,
        { contact },
      ),
    );
  }

  it('the Contact panel names the hidden fields and links to the Community profile', () => {
    renderContact({
      management: { email: 'office@example.com', phone: null },
      address: '100 Palm Way, Miami, FL',
      officeHours: null,
    });

    expect(screen.getByText("Office hours aren't added yet, so they're hidden")).toBeInTheDocument();
    expect(screen.getByText("The phone number isn't added yet, so it's hidden")).toBeInTheDocument();
    // What the profile has is not listed.
    expect(screen.queryByText(/address isn't added/)).not.toBeInTheDocument();
    expect(screen.queryByText(/contact email isn't added/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Community profile/ })).toHaveAttribute(
      'href',
      '/settings?communityId=7#community-profile',
    );
  });

  it('names every detail when the profile has none', () => {
    renderContact({ management: null, address: null, officeHours: null });
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      "The address isn't added yet, so it's hidden",
      "Office hours aren't added yet, so they're hidden",
      "The phone number isn't added yet, so it's hidden",
      "The contact email isn't added yet, so it's hidden",
    ]);
  });

  it('treats blank text as not added', () => {
    renderContact({ management: { email: '  ', phone: '' }, address: ' ', officeHours: '\n' });
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('lists nothing when the profile has every detail, and still links to it', () => {
    renderContact({
      management: { email: 'office@example.com', phone: '305-555-0100' },
      address: '100 Palm Way, Miami, FL',
      officeHours: 'Mon-Fri, 9-5',
    });
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Community profile/ })).toBeInTheDocument();
  });

  it('does not blame the profile for a phone and email the management switch hides', () => {
    renderContact(
      { management: null, address: null, officeHours: null },
      { showBoard: true, showManagement: false },
    );
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      "The address isn't added yet, so it's hidden",
      "Office hours aren't added yet, so they're hidden",
    ]);
  });

  it('lists nothing when the profile is not known', () => {
    renderContact(null);
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Community profile/ })).toBeInTheDocument();
  });
});

describe('Quick links and Board members — source links', () => {
  it('Quick links links to where each shortcut comes from', () => {
    render(<QuickLinksForm communityId={7} blockType="quicklinks" blockOrder={4} content={{}} />);

    const hrefs = Object.fromEntries(
      screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]),
    );
    expect(hrefs).toEqual({
      Meetings: '/communities/7/meetings',
      Announcements: '/announcements?communityId=7',
      Documents: '/communities/7/documents',
      'Community profile': '/settings?communityId=7#community-profile',
    });
  });

  it('Board members links to Roles & Access, where board seats are given out', () => {
    render(<BoardForm communityId={7} blockType="board" blockOrder={5} content={{}} />);
    expect(screen.getByRole('link', { name: 'Roles & Access' })).toHaveAttribute(
      'href',
      '/settings/roles?communityId=7',
    );
  });
});
