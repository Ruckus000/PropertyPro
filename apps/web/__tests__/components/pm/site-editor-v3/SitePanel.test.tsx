/**
 * Website editor v3, Phase 8 — the Site tool panel.
 *
 * Three things this file is really protecting:
 *
 *   1. the SERP preview is DECORATION — it must not reach the accessibility
 *      tree, because everything in it is already a labelled form value and
 *      hearing it twice, unlabelled, is worse than not hearing it;
 *   2. the counsel warning next to the statutory toggle is always present and
 *      cannot be dismissed (gap analysis §5 — a compliance constraint);
 *   3. the whole panel is operable from the keyboard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SEO_TITLE_MAX_LENGTH, STATUTORY_FOOTER_LINE } from '@/lib/site-editor/site-settings';

// Radix Switch (shadcn) requires ResizeObserver in jsdom.
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { useSiteSettingsMock, updateMutateMock, uploadMutateMock, recordRef } = vi.hoisted(() => ({
  useSiteSettingsMock: vi.fn(),
  updateMutateMock: vi.fn(),
  uploadMutateMock: vi.fn(),
  recordRef: { current: null as unknown },
}));

// Mock this module COMPLETELY. A partial factory fails only at module load,
// and only for whichever export the tree happens to reach — which reads as an
// unrelated component breaking rather than a short mock.
vi.mock('@/hooks/use-site-settings', () => ({
  useSiteSettings: useSiteSettingsMock,
  useUpdateSiteSettings: () => ({ mutate: updateMutateMock, isPending: false }),
  useUploadFavicon: () => ({ mutate: uploadMutateMock, isPending: false }),
  siteSettingsQueryKey: (communityId: number) =>
    ['pm', 'site', 'settings', communityId] as const,
}));

import { SitePanel } from '@/components/pm/site-editor-v3/panels/SitePanel';

const COMMUNITY = {
  name: 'Sunset Condos',
  slug: 'sunset-condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
};

const QUOTA_500_MB = 500 * 1024 * 1024;

const EMPTY_RECORD = {
  settings: { seoTitle: null, seoDescription: null, searchIndexing: true, favicon: null },
  footer: { associationName: null, note: null, showStatutoryLine: false },
  // The real record always carries storage; the default fixture matches it so
  // every test below runs with the meter present, as in production.
  storage: { assetsBytesUsed: 0, quotaBytes: QUOTA_500_MB },
};

function renderPanel(record: unknown = EMPTY_RECORD) {
  recordRef.current = record;
  useSiteSettingsMock.mockReturnValue({ data: record });
  return render(<SitePanel communityId={42} community={COMMUNITY} tagline={null} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SERP preview is decoration, not content', () => {
  it('is hidden from the accessibility tree', () => {
    renderPanel();
    const preview = screen.getByTestId('serp-preview');
    expect(preview).toHaveAttribute('aria-hidden', 'true');
  });

  it('its text is not reachable as content', () => {
    renderPanel({
      ...EMPTY_RECORD,
      settings: { ...EMPTY_RECORD.settings, seoTitle: 'A Very Distinctive Title' },
    });

    // Present visually…
    expect(screen.getByTestId('serp-preview')).toHaveTextContent('A Very Distinctive Title');
    // …but the only ACCESSIBLE occurrence is the form field itself, so a screen
    // reader hears it once, with its label.
    const matches = screen.queryAllByText('A Very Distinctive Title', {
      ignore: '[aria-hidden="true"], [aria-hidden="true"] *',
    });
    expect(matches).toHaveLength(0);
  });

  it('shows the title that will actually ship when nothing is set', () => {
    renderPanel();
    expect(screen.getByTestId('serp-preview')).toHaveTextContent(
      'Sunset Condos — Community Portal',
    );
  });
});

describe('the statutory line', () => {
  it('is off by default', () => {
    renderPanel();
    expect(screen.getByLabelText('Show the records statement')).not.toBeChecked();
  });

  it('shows the exact wording the footer will render', () => {
    renderPanel();
    expect(screen.getByText(`“${STATUTORY_FOOTER_LINE}”`)).toBeInTheDocument();
  });

  // The warning is what makes the opt-in an informed one, so it is present
  // whether or not the toggle is on, and there is no way to get rid of it.
  it('always renders the counsel warning, with no dismiss control', () => {
    renderPanel();
    const warning = screen
      .getByText('Your association is responsible for this statement.')
      .closest('div[role], div');
    expect(warning).toBeTruthy();
    expect(
      screen.getByText(/PropertyPro doesn't verify how your records are kept/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('still shows the warning when the toggle is already on', () => {
    renderPanel({
      ...EMPTY_RECORD,
      footer: { ...EMPTY_RECORD.footer, showStatutoryLine: true },
    });
    expect(screen.getByLabelText('Show the records statement')).toBeChecked();
    expect(
      screen.getByText('Your association is responsible for this statement.'),
    ).toBeInTheDocument();
  });
});

describe('keyboard operation', () => {
  it('reaches every control by tabbing, in a sensible order', async () => {
    const user = userEvent.setup();
    renderPanel();

    const order = [
      screen.getByLabelText('Page title'),
      screen.getByLabelText('Description'),
      screen.getByLabelText('Let search engines list this site'),
      screen.getByLabelText('Site icon'),
      screen.getByLabelText('Association name'),
      screen.getByLabelText('Footer note'),
      screen.getByLabelText('Show the records statement'),
      screen.getByRole('button', { name: 'Save settings' }),
    ];

    await user.tab();
    for (const element of order) {
      expect(element).toHaveFocus();
      await user.tab();
    }
  });

  it('toggles the indexing switch with the keyboard', async () => {
    const user = userEvent.setup();
    renderPanel();

    const toggle = screen.getByLabelText('Let search engines list this site');
    expect(toggle).toBeChecked();
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).not.toBeChecked();
  });

  it('toggles the statutory switch with the keyboard', async () => {
    const user = userEvent.setup();
    renderPanel();

    const toggle = screen.getByLabelText('Show the records statement');
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle).toBeChecked();
  });

  it('submits with Enter from a text field', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Page title'), 'Sunset Living{Enter}');
    expect(updateMutateMock).toHaveBeenCalled();
  });
});

describe('saving', () => {
  it('sends every field, with empty strings normalised to null', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Page title'), 'Sunset Living');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(updateMutateMock).toHaveBeenCalledWith(
      {
        seoTitle: 'Sunset Living',
        seoDescription: null,
        searchIndexing: true,
        associationName: null,
        note: null,
        showStatutoryLine: false,
      },
      expect.anything(),
    );
  });

  it('sends the opt-in when the manager turns it on', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByLabelText('Show the records statement'));
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(updateMutateMock).toHaveBeenCalledWith(
      expect.objectContaining({ showStatutoryLine: true }),
      expect.anything(),
    );
  });
});

describe('length limits', () => {
  it('counts down and blocks save once a field is over', async () => {
    const user = userEvent.setup();
    renderPanel();

    const title = screen.getByLabelText('Page title');
    await user.type(title, 'a'.repeat(SEO_TITLE_MAX_LENGTH + 2));

    expect(screen.getByText('2 over')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled();
    expect(updateMutateMock).not.toHaveBeenCalled();
  });

  // Code points, matching the server. A UTF-16 count would show "30 left" at
  // 30 emoji and freeze the field at half the stated allowance.
  it('counts emoji as one character each', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Page title'), '🌀'.repeat(10));
    expect(screen.getByText(`${SEO_TITLE_MAX_LENGTH - 10} left`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled();
  });
});

describe('resync', () => {
  it('adopts stored values that arrive after first paint', () => {
    const { rerender } = renderPanel();
    expect(screen.getByLabelText('Page title')).toHaveValue('');

    useSiteSettingsMock.mockReturnValue({
      data: {
        ...EMPTY_RECORD,
        settings: { ...EMPTY_RECORD.settings, seoTitle: 'From the server' },
      },
    });
    rerender(<SitePanel communityId={42} community={COMMUNITY} tagline={null} />);

    expect(screen.getByLabelText('Page title')).toHaveValue('From the server');
  });

  // The foot-gun this guards: a background refetch returning identical data
  // must not wipe out what someone is halfway through typing.
  it('does NOT clobber in-progress edits when a refetch returns the same values', async () => {
    const user = userEvent.setup();
    const { rerender } = renderPanel();

    await user.type(screen.getByLabelText('Page title'), 'Half-typed');

    // Same CONTENT, new object identity — exactly what a refetch produces.
    useSiteSettingsMock.mockReturnValue({ data: JSON.parse(JSON.stringify(EMPTY_RECORD)) });
    rerender(<SitePanel communityId={42} community={COMMUNITY} tagline={null} />);

    expect(screen.getByLabelText('Page title')).toHaveValue('Half-typed');
  });
});

describe('photo storage', () => {
  it('draws the bar against the quota and says how much of it is used', () => {
    renderPanel({
      ...EMPTY_RECORD,
      storage: { assetsBytesUsed: 250 * 1024 * 1024, quotaBytes: QUOTA_500_MB },
    });

    const bar = screen.getByRole('progressbar', { name: 'Photo storage used' });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '250.0 MB of 500.0 MB used');
    expect(screen.getByText('250.0 MB of 500.0 MB used')).toBeInTheDocument();
    expect(screen.queryByText(/over your plan/)).not.toBeInTheDocument();
  });

  // Null is "no plan limit". A bar would be drawn against a number that does
  // not exist, so there is none — usage only.
  it('shows usage alone, with NO progressbar, when the plan sets no quota', () => {
    renderPanel({
      ...EMPTY_RECORD,
      storage: { assetsBytesUsed: 1024, quotaBytes: null },
    });

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('1.0 KB used')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Photo storage' })).toBeInTheDocument();
  });

  // Reachable after a plan downgrade. The bar cannot exceed its own track and
  // `aria-valuenow` cannot exceed `aria-valuemax`, but the TEXT reports the
  // true bytes — and says the limit is exceeded, so the colour is not the
  // only signal.
  it('clamps the bar at 100 over quota but reports the true bytes', () => {
    renderPanel({
      ...EMPTY_RECORD,
      storage: { assetsBytesUsed: 600 * 1024 * 1024, quotaBytes: QUOTA_500_MB },
    });

    const bar = screen.getByRole('progressbar', { name: 'Photo storage used' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
    expect(screen.getByText(/600\.0 MB of 500\.0 MB used/)).toBeInTheDocument();
    expect(screen.getByText(/over your plan/)).toBeInTheDocument();
  });
});

describe('malformed stored data', () => {
  // The panel gets its record from the server-rendered resolvers, which are
  // total — but it must not assume that, since `useSiteSettings` can also
  // return undefined before the first fetch resolves.
  it('renders with no record at all', () => {
    useSiteSettingsMock.mockReturnValue({ data: undefined });
    expect(() =>
      render(<SitePanel communityId={42} community={COMMUNITY} tagline={null} />),
    ).not.toThrow();
    expect(screen.getByLabelText('Let search engines list this site')).toBeChecked();
  });
});
