/**
 * Website editor v3 — the Help tool panel.
 *
 * What this file is really protecting:
 *
 *   1. it surfaces the EXISTING help centre rather than a second one — every
 *      result comes from the shared `use-help` hooks, and the route it asks
 *      about is the editor's, not whatever URL it happens to be mounted at;
 *   2. links open in a new tab, because following one in place would tear down
 *      the canvas and the inspector's open form;
 *   3. a failed suggestions fetch degrades quietly — the panel is not broken
 *      when it merely has nothing to suggest, since search still works.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { contextualMock, featuredMock, searchMock } = vi.hoisted(() => ({
  contextualMock: vi.fn(),
  featuredMock: vi.fn(),
  searchMock: vi.fn(),
}));

// Mocked COMPLETELY — a partial factory fails at module load for whichever
// export the tree happens to reach.
vi.mock('@/hooks/use-help', () => ({
  useContextualHelp: contextualMock,
  useFeaturedArticles: featuredMock,
  useHelpSearch: searchMock,
  HELP_KEYS: {
    search: () => ['help', 'search'],
    contextual: () => ['help', 'contextual'],
    featured: () => ['help', 'featured'],
  },
}));

import { HelpPanel } from '@/components/pm/site-editor-v3/panels/HelpPanel';

const ARTICLE = {
  title: 'Customizing PM branding',
  description: 'Set your own colours and fonts.',
  category: 'pm',
  slug: 'customizing-pm-branding',
};

function idle() {
  return { data: undefined, isPending: false, isError: false, error: null };
}
function loaded<T>(data: T) {
  return { data, isPending: false, isError: false, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  contextualMock.mockReturnValue(loaded([ARTICLE]));
  featuredMock.mockReturnValue(loaded([]));
  searchMock.mockReturnValue(idle());
});

describe('resting state', () => {
  it('asks for help about the editor route, not the mounted URL', () => {
    render(<HelpPanel communityId={42} />);
    expect(contextualMock).toHaveBeenCalledWith(
      '/pm/website-editor',
      42,
      expect.objectContaining({ enabled: true }),
    );
  });

  it('lists the contextual articles under an "about your website" heading', () => {
    render(<HelpPanel communityId={42} />);
    expect(screen.getByTestId('help-panel-suggested')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /about your website/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /customizing pm branding/i })).toHaveAttribute(
      'href',
      '/help/pm/customizing-pm-branding',
    );
  });

  it('falls back to featured articles when nothing is tagged for the route', () => {
    contextualMock.mockReturnValue(loaded([]));
    featuredMock.mockReturnValue(
      loaded([{ ...ARTICLE, title: 'Popular one', slug: 'popular-one' }]),
    );
    render(<HelpPanel communityId={42} />);
    expect(screen.getByRole('heading', { name: /popular with managers/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /popular one/i })).toBeInTheDocument();
  });

  it('degrades quietly when suggestions fail, instead of claiming the panel broke', () => {
    contextualMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('nope'),
    });
    render(<HelpPanel communityId={42} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/no suggestions right now/i)).toBeInTheDocument();
    // The two things that still work are still offered.
    expect(screen.getByLabelText(/search help/i)).toBeInTheDocument();
    expect(screen.getByTestId('help-panel-hub-link')).toBeInTheDocument();
  });
});

describe('searching', () => {
  it('holds the suggestions query while a search is active', async () => {
    const user = userEvent.setup();
    render(<HelpPanel communityId={42} />);

    await user.type(screen.getByLabelText(/search help/i), 'domain');

    expect(contextualMock).toHaveBeenLastCalledWith(
      '/pm/website-editor',
      42,
      expect.objectContaining({ enabled: false }),
    );
    expect(searchMock).toHaveBeenLastCalledWith('domain', 42);
  });

  it('renders article and FAQ results', async () => {
    const user = userEvent.setup();
    searchMock.mockReturnValue(
      loaded({
        articles: [ARTICLE],
        faqs: [{ id: 1, question: 'Can I use my own domain?', answer: 'Yes, on Professional.' }],
      }),
    );
    render(<HelpPanel communityId={42} />);

    await user.type(screen.getByLabelText(/search help/i), 'domain');

    expect(screen.getByTestId('help-panel-article-results')).toBeInTheDocument();
    expect(screen.getByTestId('help-panel-faq-results')).toBeInTheDocument();
    expect(screen.getByText(/can i use my own domain/i)).toBeInTheDocument();
  });

  it('shows an empty state when a search matches nothing', async () => {
    const user = userEvent.setup();
    searchMock.mockReturnValue(loaded({ articles: [], faqs: [] }));
    render(<HelpPanel communityId={42} />);

    await user.type(screen.getByLabelText(/search help/i), 'zzzz');

    expect(screen.getByText(/nothing matched that/i)).toBeInTheDocument();
  });

  it('surfaces a search failure, which IS worth an alert', async () => {
    const user = userEvent.setup();
    searchMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('Search is unavailable.'),
    });
    render(<HelpPanel communityId={42} />);

    await user.type(screen.getByLabelText(/search help/i), 'domain');

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't run that search/i);
  });
});

describe('leaving the editor', () => {
  it('opens every link in a new tab so the editor is not torn down', () => {
    render(<HelpPanel communityId={42} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('links out to the full help centre', () => {
    render(<HelpPanel communityId={42} />);
    expect(screen.getByTestId('help-panel-hub-link')).toHaveAttribute('href', '/help');
  });
});
