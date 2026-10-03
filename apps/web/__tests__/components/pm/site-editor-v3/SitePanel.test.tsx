/**
 * Website editor v3, Phase 8 — the site's search and footer forms, and (v4
 * Phase 5, where they moved into the Settings view) the site icon, sharing
 * image and photo storage beside them.
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

const {
  useSiteSettingsMock,
  updateMutateMock,
  uploadMutateMock,
  shareMutateMock,
  recordRef,
  pendingRef,
} =
  vi.hoisted(() => ({
    useSiteSettingsMock: vi.fn(),
    updateMutateMock: vi.fn(),
    uploadMutateMock: vi.fn(),
    shareMutateMock: vi.fn(),
    recordRef: { current: null as unknown },
    pendingRef: { current: false },
  }));

// Mock this module COMPLETELY. A partial factory fails only at module load,
// and only for whichever export the tree happens to reach — which reads as an
// unrelated component breaking rather than a short mock.
vi.mock('@/hooks/use-site-settings', () => ({
  useSiteSettings: useSiteSettingsMock,
  useUpdateSiteSettings: () => ({ mutate: updateMutateMock, isPending: pendingRef.current }),
  useUploadFavicon: () => ({ mutate: uploadMutateMock, isPending: false }),
  useUploadShareImage: () => ({ mutate: shareMutateMock, isPending: false }),
  siteSettingsQueryKey: (communityId: number) =>
    ['pm', 'site', 'settings', communityId] as const,
}));

import {
  ShareImageField,
  SiteIconField,
  SitePanel,
  StorageMeter,
} from '@/components/pm/site-editor-v3/panels/SitePanel';

const COMMUNITY = {
  name: 'Sunset Condos',
  slug: 'sunset-condos',
  communityType: 'condo_718' as const,
  city: 'Miami',
};

const QUOTA_500_MB = 500 * 1024 * 1024;

const EMPTY_RECORD = {
  settings: {
    seoTitle: null,
    seoDescription: null,
    searchIndexing: true,
    favicon: null,
    shareImage: null,
  },
  footer: { associationName: null, note: null, showStatutoryLine: false },
  // The real record always carries storage; the default fixture matches it so
  // every test below runs with the meter present, as in production.
  storage: { assetsBytesUsed: 0, quotaBytes: QUOTA_500_MB },
};

type Part = 'search' | 'footer';

function panel(part: Part) {
  return <SitePanel communityId={42} community={COMMUNITY} tagline={null} part={part} />;
}

function renderPanel(record: unknown = EMPTY_RECORD, part: Part = 'search') {
  recordRef.current = record;
  useSiteSettingsMock.mockReturnValue({ data: record });
  return render(panel(part));
}

beforeEach(() => {
  vi.clearAllMocks();
  pendingRef.current = false;
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
    renderPanel(EMPTY_RECORD, 'footer');
    expect(screen.getByLabelText('Show the records statement')).not.toBeChecked();
  });

  it('shows the exact wording the footer will render', () => {
    renderPanel(EMPTY_RECORD, 'footer');
    expect(screen.getByText(`“${STATUTORY_FOOTER_LINE}”`)).toBeInTheDocument();
  });

  // The warning is what makes the opt-in an informed one, so it is present
  // whether or not the toggle is on, and there is no way to get rid of it.
  it('always renders the counsel warning, with no dismiss control', () => {
    renderPanel(EMPTY_RECORD, 'footer');
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
    renderPanel(
      {
        ...EMPTY_RECORD,
        footer: { ...EMPTY_RECORD.footer, showStatutoryLine: true },
      },
      'footer',
    );
    expect(screen.getByLabelText('Show the records statement')).toBeChecked();
    expect(
      screen.getByText('Your association is responsible for this statement.'),
    ).toBeInTheDocument();
  });
});

describe('keyboard operation', () => {
  it('reaches every search control by tabbing, in a sensible order', async () => {
    const user = userEvent.setup();
    renderPanel();

    const order = [
      screen.getByLabelText('Page title'),
      screen.getByLabelText('Description'),
      screen.getByLabelText('Let search engines list this site'),
      screen.getByRole('button', { name: 'Save search settings' }),
    ];

    await user.tab();
    for (const element of order) {
      expect(element).toHaveFocus();
      await user.tab();
    }
  });

  it('reaches every footer control by tabbing, in a sensible order', async () => {
    const user = userEvent.setup();
    renderPanel(EMPTY_RECORD, 'footer');

    const order = [
      screen.getByLabelText('Association name'),
      screen.getByLabelText('Footer note'),
      screen.getByLabelText('Show the records statement'),
      screen.getByRole('button', { name: 'Save footer' }),
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
    renderPanel(EMPTY_RECORD, 'footer');

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
  // Each form sends only its own fields: the PATCH leaves absent fields alone,
  // so saving one can never overwrite the other with stale values.
  it('the search form sends only search fields, with empty strings normalised to null', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Page title'), 'Sunset Living');
    await user.click(screen.getByRole('button', { name: 'Save search settings' }));

    expect(updateMutateMock).toHaveBeenCalledWith(
      { seoTitle: 'Sunset Living', seoDescription: null, searchIndexing: true },
      expect.anything(),
    );
  });

  it('the footer form sends only footer fields, including the opt-in', async () => {
    const user = userEvent.setup();
    renderPanel(EMPTY_RECORD, 'footer');

    await user.click(screen.getByLabelText('Show the records statement'));
    await user.click(screen.getByRole('button', { name: 'Save footer' }));

    expect(updateMutateMock).toHaveBeenCalledWith(
      { associationName: null, note: null, showStatutoryLine: true },
      expect.anything(),
    );
  });
});

describe('while a save is in flight', () => {
  // The resync replaces the form with the saved values when the save lands, so
  // anything typed in between would be dropped. The fields refuse input for
  // that window instead, and keep focus (read-only, not disabled).
  // Revert check: `readOnly={update.isPending}` / `disabled={update.isPending}`.
  it('the search fields are read-only and ignore typing, then edit again after', async () => {
    const user = userEvent.setup();
    pendingRef.current = true;
    const { rerender } = renderPanel();

    const title = screen.getByLabelText('Page title');
    expect(title).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Description')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Let search engines list this site')).toBeDisabled();
    await user.type(title, 'lost');
    expect(title).toHaveValue('');

    pendingRef.current = false;
    rerender(panel('search'));
    await user.type(title, 'kept');
    expect(title).toHaveValue('kept');
  });

  it('the footer fields are read-only and ignore typing', async () => {
    const user = userEvent.setup();
    pendingRef.current = true;
    renderPanel(EMPTY_RECORD, 'footer');

    const note = screen.getByLabelText('Footer note');
    expect(screen.getByLabelText('Association name')).toHaveAttribute('readonly');
    expect(note).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Show the records statement')).toBeDisabled();
    await user.type(note, 'lost');
    expect(note).toHaveValue('');
  });
});

describe('length limits', () => {
  it('counts down and blocks save once a field is over', async () => {
    const user = userEvent.setup();
    renderPanel();

    const title = screen.getByLabelText('Page title');
    await user.type(title, 'a'.repeat(SEO_TITLE_MAX_LENGTH + 2));

    expect(screen.getByText('2 over')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save search settings' })).toBeDisabled();
    expect(updateMutateMock).not.toHaveBeenCalled();
  });

  // Code points, matching the server. A UTF-16 count would show "30 left" at
  // 30 emoji and freeze the field at half the stated allowance.
  it('counts emoji as one character each', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByLabelText('Page title'), '🌀'.repeat(10));
    expect(screen.getByText(`${SEO_TITLE_MAX_LENGTH - 10} left`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save search settings' })).toBeEnabled();
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
    rerender(panel('search'));

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
    rerender(panel('search'));

    expect(screen.getByLabelText('Page title')).toHaveValue('Half-typed');
  });

  // The two forms share one record. A change to the OTHER part's stored values
  // (the footer saved, or an image uploaded) must not reset this one.
  it('does NOT clobber search edits when only the footer or images change', async () => {
    const user = userEvent.setup();
    const { rerender } = renderPanel();

    await user.type(screen.getByLabelText('Page title'), 'Half-typed');

    useSiteSettingsMock.mockReturnValue({
      data: {
        ...EMPTY_RECORD,
        settings: { ...EMPTY_RECORD.settings, shareImage: { path: '42/share/x.jpg', bytes: 9 } },
        footer: { ...EMPTY_RECORD.footer, note: 'Managed by Acme' },
      },
    });
    rerender(panel('search'));

    expect(screen.getByLabelText('Page title')).toHaveValue('Half-typed');
  });
});

describe('photo storage', () => {
  const meter = (assetsBytesUsed: number, quotaBytes: number | null) =>
    render(<StorageMeter storage={{ assetsBytesUsed, quotaBytes }} />);

  it('draws the bar against the quota and says how much of it is used', () => {
    meter(250 * 1024 * 1024, QUOTA_500_MB);

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
    meter(1024, null);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('1.0 KB used')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Photo storage' })).toBeInTheDocument();
  });

  // Reachable after a plan downgrade. The bar cannot exceed its own track and
  // `aria-valuenow` cannot exceed `aria-valuemax`, but the TEXT reports the
  // true bytes — and says the limit is exceeded, so the colour is not the
  // only signal.
  it('clamps the bar at 100 over quota but reports the true bytes', () => {
    meter(600 * 1024 * 1024, QUOTA_500_MB);

    const bar = screen.getByRole('progressbar', { name: 'Photo storage used' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
    expect(screen.getByText(/600\.0 MB of 500\.0 MB used/)).toBeInTheDocument();
    expect(screen.getByText(/over your plan/)).toBeInTheDocument();
  });
});

describe('site icon and sharing image', () => {
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

  it('uploads the site icon as soon as a file is picked', async () => {
    const user = userEvent.setup();
    useSiteSettingsMock.mockReturnValue({ data: EMPTY_RECORD });
    render(<SiteIconField communityId={42} />);

    await user.upload(screen.getByLabelText('Site icon'), file);
    expect(uploadMutateMock).toHaveBeenCalledWith(file, expect.anything());
  });

  it('says plainly when there is no sharing image, and uploads one on pick', async () => {
    const user = userEvent.setup();
    useSiteSettingsMock.mockReturnValue({ data: EMPTY_RECORD });
    render(<ShareImageField communityId={42} />);

    expect(screen.getByTestId('share-image-empty')).toHaveTextContent(
      /shared links show only your site's title and description/,
    );
    await user.upload(screen.getByLabelText('Add an image'), file);
    expect(shareMutateMock).toHaveBeenCalledWith(file, expect.anything());
  });

  it('shows the current sharing image and offers to replace it', () => {
    useSiteSettingsMock.mockReturnValue({
      data: {
        ...EMPTY_RECORD,
        settings: { ...EMPTY_RECORD.settings, shareImage: { path: '42/share/a.jpg', bytes: 9 } },
      },
    });
    render(<ShareImageField communityId={42} />);

    expect(screen.getByRole('img', { name: 'Your current sharing image' })).toHaveAttribute(
      'src',
      expect.stringContaining('42/share/a.jpg'),
    );
    expect(screen.getByLabelText('Replace the image')).toBeInTheDocument();
    expect(screen.queryByTestId('share-image-empty')).not.toBeInTheDocument();
  });
});

describe('malformed stored data', () => {
  // The panel gets its record from the server-rendered resolvers, which are
  // total — but it must not assume that, since `useSiteSettings` can also
  // return undefined before the first fetch resolves.
  it('renders with no record at all', () => {
    useSiteSettingsMock.mockReturnValue({ data: undefined });
    expect(() => render(panel('search'))).not.toThrow();
    expect(screen.getByLabelText('Let search engines list this site')).toBeChecked();
  });
});
