/**
 * Website builder v4, Phase 3 — the editor's Help drawer.
 *
 * What this file protects:
 *
 *   1. it lists the guides tagged for the editor route, all of them (above the
 *      contextual route's default cap), grouped as the design groups them and
 *      with the current area's guides first;
 *   2. a guide opens IN the drawer, and "Show me" runs the editor action after
 *      asking the drawer to close — never an "Open Publish" that cannot open;
 *   3. Escape closes the drawer and returns focus to its opener, except while
 *      an enlarged figure is open, which Escape closes first.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { contextualMock, searchMock, articleMock } = vi.hoisted(() => ({
  contextualMock: vi.fn(),
  searchMock: vi.fn(),
  articleMock: vi.fn(),
}));

vi.mock('@/hooks/use-help', () => ({
  useContextualHelp: contextualMock,
  useHelpSearch: searchMock,
  useHelpArticle: articleMock,
}));

// The modal's reader brings feedback, view tracking and a Radix lightbox; the
// drawer's contract with it is the props, so a stand-in exercises those.
vi.mock('@/components/help/help-article-body', () => ({
  HelpArticleBody: ({
    metadata,
    onOpenArticle,
    onLightboxOpenChange,
  }: {
    metadata: { title: string };
    onOpenArticle: (category: string, slug: string) => void;
    onLightboxOpenChange?: (open: boolean) => void;
  }) => (
    <div>
      <h1>{metadata.title}</h1>
      <button type="button" onClick={() => onOpenArticle('website', 'website-pages')}>
        linked guide
      </button>
      <button type="button" onClick={() => onLightboxOpenChange?.(true)}>
        enlarge
      </button>
    </div>
  ),
}));

import { HelpDrawer } from '@/components/pm/site-editor-v3/help/HelpDrawer';

const guide = (slug: string, title: string) => ({
  title,
  description: `${title} description`,
  category: 'website',
  slug,
});

const GUIDES = [
  // Deliberately out of reading order: the drawer sorts by its guide map.
  guide('website-search', 'Show up in search results'),
  guide('publish-website', 'Publish your changes'),
  guide('edit-words-and-photos', 'Change the words and photos'),
  guide('website-domain', 'Use your own domain'),
  guide('brand-new-guide', 'A guide the map does not know'),
];

function loaded<T>(data: T) {
  return { data, isPending: false, isError: false, error: null, refetch: vi.fn() };
}
function idle() {
  return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() };
}

const onClose = vi.fn();
const onShowMe = vi.fn();

function renderDrawer(overrides: Partial<React.ComponentProps<typeof HelpDrawer>> = {}) {
  return render(
    <HelpDrawer
      communityId={42}
      view="website"
      onClose={onClose}
      onShowMe={onShowMe}
      canPublish
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  contextualMock.mockReturnValue(loaded(GUIDES));
  searchMock.mockReturnValue(idle());
  articleMock.mockImplementation((category: string | null, slug: string | null) =>
    category && slug
      ? loaded({
          html: '<p>body</p>',
          metadata: { title: GUIDES.find((g) => g.slug === slug)?.title ?? slug, slug, category },
          related: [],
        })
      : idle(),
  );
});

function section(name: string) {
  return screen.getByRole('region', { name });
}

describe('HelpDrawer — the guide list', () => {
  it('asks for every guide tagged for the editor route, above the default cap', () => {
    renderDrawer();
    expect(contextualMock).toHaveBeenCalledWith('/pm/website-editor', 42, { limit: 20 });
  });

  it("lists the current area's guides first, then the rest by group", () => {
    renderDrawer();
    const first = section('Help with your website');
    expect(within(first).getAllByRole('button').map((b) => b.textContent)).toEqual([
      expect.stringContaining('Change the words and photos'),
      expect.stringContaining('Publish your changes'),
    ]);
    // Not listed twice: a guide shown first is left out of its group.
    expect(
      within(section('Site settings')).getAllByRole('button').map((b) => b.textContent),
    ).toEqual([
      expect.stringContaining('Use your own domain'),
      expect.stringContaining('Show up in search results'),
    ]);
    expect(screen.queryByRole('region', { name: 'Editing your site' })).not.toBeInTheDocument();
  });

  it('puts the Settings guides first while Settings is showing', () => {
    renderDrawer({ view: 'settings' });
    expect(
      within(section('Help with Settings')).getAllByRole('button').map((b) => b.textContent),
    ).toEqual([
      expect.stringContaining('Publish your changes'),
      expect.stringContaining('Use your own domain'),
      expect.stringContaining('Show up in search results'),
    ]);
  });

  it('still lists a tagged guide the map does not know, under More help', () => {
    renderDrawer();
    expect(
      within(section('More help')).getByRole('button', { name: /a guide the map does not know/i }),
    ).toBeInTheDocument();
  });
});

describe('HelpDrawer — reading a guide', () => {
  it('opens the guide in the drawer, and Back returns to the list', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /change the words and photos/i }));
    expect(articleMock).toHaveBeenLastCalledWith('website', 'edit-words-and-photos', 42);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Change the words and photos' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open in the help centre/i })).toHaveAttribute(
      'href',
      '/help/website/edit-words-and-photos',
    );

    await user.click(screen.getByTestId('help-drawer-back'));
    expect(section('Help with your website')).toBeInTheDocument();
  });

  it('names the open guide in the heading focus lands on', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /change the words and photos/i }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Help: Change the words and photos' }),
    ).toHaveFocus();
  });

  it('steps left of a docked inspector instead of covering it', () => {
    // jsdom cannot evaluate `:has()`; this pins the two halves of the selector.
    renderDrawer();
    expect(document.getElementById('site-editor-help')).toHaveClass(
      'group-has-[[data-docked-inspector]]/editor:right-80',
    );
  });

  it('runs "Show me" after asking the drawer to close', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /use your own domain/i }));
    await user.click(screen.getByRole('button', { name: 'Open Address & domain' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onShowMe).toHaveBeenCalledWith({ kind: 'settings', tab: 'address' });
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(
      onShowMe.mock.invocationCallOrder[0]!,
    );
  });

  it('leaves out "Open Publish" when Publish cannot open', async () => {
    const user = userEvent.setup();
    renderDrawer({ canPublish: false });
    await user.click(screen.getByRole('button', { name: /publish your changes/i }));
    expect(screen.queryByRole('button', { name: 'Open Publish' })).not.toBeInTheDocument();
  });

  it('offers the next guide in reading order, wrapping at the end', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /show up in search results/i }));
    // website-search is the map's last guide; next is the unknown one, then the first.
    await user.click(screen.getByRole('button', { name: /next guide.*a guide the map/i }));
    await user.click(screen.getByRole('button', { name: /next guide.*change the words/i }));
    expect(articleMock).toHaveBeenLastCalledWith('website', 'edit-words-and-photos', 42);
  });

  it('opens a guide linked from inside a guide in the drawer too', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /change the words and photos/i }));
    await user.click(screen.getByRole('button', { name: 'linked guide' }));
    expect(articleMock).toHaveBeenLastCalledWith('website', 'website-pages', 42);
  });
});

describe('HelpDrawer — search', () => {
  it('opens a search result in the drawer', async () => {
    const user = userEvent.setup();
    searchMock.mockReturnValue(
      loaded({ articles: [guide('upload-document', 'Upload a document')], faqs: [] }),
    );
    renderDrawer();
    await user.type(screen.getByRole('searchbox', { name: 'Search help' }), 'upload');
    expect(screen.getByRole('status')).toHaveTextContent('1 guide found');
    await user.click(screen.getByRole('button', { name: /upload a document/i }));
    expect(articleMock).toHaveBeenLastCalledWith('website', 'upload-document', 42);
  });

  it('says plainly when nothing matched', async () => {
    const user = userEvent.setup();
    searchMock.mockReturnValue(loaded({ articles: [], faqs: [] }));
    renderDrawer();
    await user.type(screen.getByRole('searchbox', { name: 'Search help' }), 'zzz');
    expect(screen.getByText(/nothing found for/i)).toHaveTextContent('Nothing found for “zzz”');
  });
});

describe('HelpDrawer — focus and Escape', () => {
  function withOpener() {
    const opener = document.createElement('button');
    opener.textContent = 'Help';
    document.body.appendChild(opener);
    opener.focus();
    return opener;
  }

  it('moves focus into the drawer when it opens', () => {
    const opener = withOpener();
    renderDrawer();
    expect(screen.getByRole('heading', { name: 'Help' })).toHaveFocus();
    opener.remove();
  });

  it('closes on Escape and returns focus to the opener', async () => {
    const user = userEvent.setup();
    const opener = withOpener();
    renderDrawer();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('leaves the drawer open on Escape while a figure is enlarged', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: /change the words and photos/i }));
    await user.click(screen.getByRole('button', { name: 'enlarge' }));
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes from its close button', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Close help' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
