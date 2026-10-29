/**
 * The wizard's live-preview route must hand `<Layout>` the same props the real
 * public route does, or the preview shows a site the visitor will not get.
 *
 * There was no test of any kind for this route before this file. Mock shape is
 * lifted from `site-page.test.tsx`, the equivalent test for the real route.
 *
 * Deliberately NOT mocked: `@/lib/site-editor/site-settings` and
 * `@/lib/public-site/preview-overrides`. Both are pure and dependency-free, and
 * the point of the footer case is that the REAL resolver reads the PM's fields
 * out of the branding blob — a mocked resolver would assert nothing.
 *
 * The `?look=` cases add `@/lib/site-looks/looks` to that list (pure too): the
 * preview must show what the look switch would leave, so it is the REAL planner
 * that plans the sections here. Only the database read underneath it
 * (`loadLookSwitchInput`) is replaced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const {
  getCommunityPublicInfoMock,
  getBrandingForCommunityMock,
  listSiteBlocksMock,
  getHomePageIdMock,
  listNavPagesMock,
  createPresignedDownloadUrlMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  hasRoleMock,
  getLayoutMock,
  listThemePresetsMock,
  loadLookSwitchInputMock,
  draftLookSwitchMock,
  capturedProps,
} = vi.hoisted(() => ({
  getCommunityPublicInfoMock: vi.fn(),
  getBrandingForCommunityMock: vi.fn(),
  listSiteBlocksMock: vi.fn().mockResolvedValue([]),
  getHomePageIdMock: vi.fn().mockResolvedValue(1),
  listNavPagesMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn().mockResolvedValue('user-1'),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue({ role: 'property_manager' }),
  hasRoleMock: vi.fn().mockReturnValue(true),
  getLayoutMock: vi.fn(),
  listThemePresetsMock: vi.fn(),
  loadLookSwitchInputMock: vi.fn(),
  draftLookSwitchMock: vi.fn(),
  capturedProps: [] as Record<string, unknown>[],
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock('@/lib/api/branding', () => ({
  getCommunityPublicInfo: getCommunityPublicInfoMock,
  getBrandingForCommunity: getBrandingForCommunityMock,
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: () => ({
    listSiteBlocks: listSiteBlocksMock,
    getHomePageId: getHomePageIdMock,
    listNavPages: listNavPagesMock,
  }),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));

vi.mock('@/lib/request/page-auth-context', () => ({
  requirePageAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/role-guard', () => ({
  hasRole: hasRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));

vi.mock('@/lib/db/theme-preset-catalog', () => ({
  listThemePresets: listThemePresetsMock,
}));

// The one database read behind a look preview. `draftLookSwitch` is here only so
// a case can prove the preview never calls it.
vi.mock('@/lib/services/site-look-service', () => ({
  loadLookSwitchInput: loadLookSwitchInputMock,
  draftLookSwitch: draftLookSwitchMock,
}));

// `--brand` is returned by BOTH doubles with different values, so the merge
// order is observable: whichever value lands on the wrapper proves which side
// won. Custom overrides must win, exactly as they do on the live site.
vi.mock('@propertypro/theme', () => ({
  resolveTheme: vi.fn(() => ({
    primaryColor: '#0e3338',
    secondaryColor: '#f6f1e6',
    accentColor: '#c66f49',
    fontHeading: 'Fraunces',
    fontBody: 'Manrope',
    logoUrl: 'https://signed/square-avatar.png',
    communityName: 'Sunset Condos',
    communityType: 'condo_718',
  })),
  toCssVars: vi.fn(() => ({ '--brand': 'from-theme', '--only-theme': 'kept' })),
  toFontLinks: vi.fn(() => []),
  customCssOverridesToCssVars: vi.fn(() => ({ '--brand': 'from-override' })),
}));

vi.mock('@/components/public-site/layouts/registry', () => ({
  getLayout: getLayoutMock,
}));

import SitePreviewPage from '@/app/(site-preview)/pm/site-preview/page';
import { customCssOverridesToCssVars, resolveTheme } from '@propertypro/theme';
import { getLook, type LookId, type SiteSection } from '@/lib/site-looks/looks';
import { SITE_LOOK_PRESETS } from '../../fixtures/site-look-presets';

const NAV_PAGES = [
  { id: 1, name: 'Home', slug: '', isHome: true },
  { id: 7, name: 'About Us', slug: 'about', isHome: false },
];

const BRANDING = {
  logoPath: 'communities/1/logo.png',
  siteLogoPath: 'communities/1/wordmark.png',
  siteFooter: {
    associationName: 'Sunset Condominium Association, Inc.',
    note: 'Managed by Acme Property Group',
    showStatutoryLine: true,
  },
  customCssOverrides: { primaryColor: '#123456' },
};

async function renderPreview(extraParams: Record<string, string> = {}) {
  const element = await SitePreviewPage({
    searchParams: Promise.resolve({ communityId: '1', ...extraParams }),
  });
  return render(element);
}

describe('SitePreviewPage — the props it hands <Layout>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedProps.length = 0;

    getCommunityPublicInfoMock.mockResolvedValue({
      id: 1,
      slug: 'sunset-condos',
      name: 'Sunset Condos',
      communityType: 'condo_718',
    });
    getBrandingForCommunityMock.mockResolvedValue(BRANDING);
    listNavPagesMock.mockResolvedValue(NAV_PAGES);
    listSiteBlocksMock.mockResolvedValue([]);
    getHomePageIdMock.mockResolvedValue(1);
    hasRoleMock.mockReturnValue(true);
    listThemePresetsMock.mockResolvedValue([]);
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue({ role: 'property_manager' });

    // Distinct URL per storage path, so the header-logo case can tell the
    // wordmark from the square avatar rather than just "some signed URL".
    createPresignedDownloadUrlMock.mockImplementation(async (_bucket: string, path: string) =>
      path.includes('wordmark') ? 'https://signed/wordmark.png' : 'https://signed/square.png',
    );

    getLayoutMock.mockReturnValue((props: Record<string, unknown>) => {
      capturedProps.push(props);
      return null;
    });
  });

  it('passes the PM-authored footer, including the opt-in statutory line', async () => {
    await renderPreview();

    expect(capturedProps).toHaveLength(1);
    expect(capturedProps[0]!.footer).toEqual({
      associationName: 'Sunset Condominium Association, Inc.',
      note: 'Managed by Acme Property Group',
      showStatutoryLine: true,
    });
  });

  it('passes the page nav with the home slug as the current one', async () => {
    await renderPreview();

    expect(listNavPagesMock).toHaveBeenCalledTimes(1);
    expect(capturedProps[0]!.nav).toEqual({ items: NAV_PAGES, currentSlug: '' });
  });

  it('prefers the wordmark over the square avatar for the header logo', async () => {
    await renderPreview();

    const community = capturedProps[0]!.community as { logoUrl: string };
    expect(community.logoUrl).toBe('https://signed/wordmark.png');
  });

  it('falls back to the square avatar when there is no wordmark', async () => {
    getBrandingForCommunityMock.mockResolvedValue({ ...BRANDING, siteLogoPath: undefined });

    await renderPreview();

    // resolveTheme's logoUrl, i.e. the square avatar the theme resolved.
    const community = capturedProps[0]!.community as { logoUrl: string };
    expect(community.logoUrl).toBe('https://signed/square-avatar.png');
  });

  it('survives a failed wordmark presign rather than 500ing the preview', async () => {
    createPresignedDownloadUrlMock.mockImplementation(async (_b: string, path: string) => {
      if (path.includes('wordmark')) throw new Error('storage down');
      return 'https://signed/square.png';
    });

    await renderPreview();

    const community = capturedProps[0]!.community as { logoUrl: string };
    expect(community.logoUrl).toBe('https://signed/square-avatar.png');
  });

  it('merges Pro+ custom CSS overrides over the resolved theme', async () => {
    const { container } = await renderPreview();

    const root = container.querySelector('[data-testid="site-preview-root"]') as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.style.getPropertyValue('--brand')).toBe('from-override');
    // The override must not clobber untouched theme vars.
    expect(root.style.getPropertyValue('--only-theme')).toBe('kept');
  });

  it('omits `page`, which the layouts read as "this is the home page"', async () => {
    await renderPreview();

    expect(capturedProps[0]!.page).toBeUndefined();
  });

  it("hands the layout the community's real city, state, short name and unit count", async () => {
    // The preview must resolve a linked field ({{city}}) exactly as the live
    // site does, so it needs the same facts the live route passes.
    getCommunityPublicInfoMock.mockResolvedValue({
      id: 1,
      slug: 'sunset-condos',
      name: 'Sunset Condominium Association, Inc.',
      shortName: 'Sunset',
      communityType: 'condo_718',
      city: 'Miami',
      state: 'FL',
      unitCount: 120,
    });

    await renderPreview();

    expect(capturedProps[0]!.community).toMatchObject({
      name: 'Sunset Condominium Association, Inc.',
      shortName: 'Sunset',
      city: 'Miami',
      state: 'FL',
      unitCount: 120,
    });
  });

  // ---------------------------------------------------------------------------
  // ?look=<id> (website builder, Phase 2B): the picker's cards are iframes of this.
  // ---------------------------------------------------------------------------

  describe('?look=<id>', () => {
    /** A home page exactly as `look` published it: untouched, with row ids and slots. */
    function siteOn(lookId: LookId) {
      const sections = getLook(lookId)!.sections;
      const current: SiteSection[] = sections.map((section, i) => ({
        id: 100 + i,
        slot: i + 1,
        blockType: section.blockType,
        content: structuredClone(section.content),
      }));
      return {
        homePageId: 1,
        current,
        published: new Map(),
        outgoingLayoutId: lookId,
        outgoingDefaults: [sections],
        draftedLookId: null,
        live: {
          lookId,
          otherLayoutDrafted: false,
          sections: current.map((s) => ({ ...s, id: s.id! })),
        },
      };
    }

    const typesOf = (props: Record<string, unknown>) =>
      (props.blocks as Array<{ blockType: string }>).map((b) => b.blockType);

    beforeEach(() => {
      loadLookSwitchInputMock.mockResolvedValue(siteOn('bayfront'));
      listThemePresetsMock.mockResolvedValue([
        {
          id: 3,
          slug: 'heritage',
          displayName: 'Heritage',
          description: 'Formal and official.',
          tokens: SITE_LOOK_PRESETS.heritage,
          tier: 'essentials',
          isFeatured: false,
        },
      ]);
    });

    it('site-preview ?look=heritage renders the heritage layout with a board section and writes nothing', async () => {
      await renderPreview({ look: 'heritage' });

      expect(getLayoutMock).toHaveBeenCalledWith('heritage');
      expect(capturedProps).toHaveLength(1);
      // Bayfront has no Board members section; Heritage does.
      expect(typesOf(capturedProps[0]!)).toContain('board');
      expect(typesOf(capturedProps[0]!)).toEqual(getLook('heritage')!.sections.map((s) => s.blockType));
      // Read once, for the community being previewed, and nothing is drafted.
      expect(loadLookSwitchInputMock).toHaveBeenCalledTimes(1);
      expect(loadLookSwitchInputMock).toHaveBeenCalledWith(1);
      expect(draftLookSwitchMock).not.toHaveBeenCalled();
    });

    it('paints the look’s own colour set and fonts', async () => {
      await renderPreview({ look: 'heritage' });

      expect(resolveTheme).toHaveBeenCalledTimes(1);
      expect(vi.mocked(resolveTheme).mock.calls[0]![0]).toMatchObject({
        primaryColor: SITE_LOOK_PRESETS.heritage.primaryColor,
        secondaryColor: SITE_LOOK_PRESETS.heritage.secondaryColor,
        accentColor: SITE_LOOK_PRESETS.heritage.accentColor,
        fontHeading: SITE_LOOK_PRESETS.heritage.headingFont,
        fontBody: SITE_LOOK_PRESETS.heritage.bodyFont,
      });
    });

    it('shows the sections as the switch would leave them: an edited section stays', async () => {
      // The preview and the draft plan from the same input, so a manager's edit
      // is in the preview of every look, as it will be on the page.
      const input = siteOn('bayfront');
      input.current[0] = { ...input.current[0]!, content: { headline: 'Harbor Pointe', subtitle: 'Our own words.' } };
      loadLookSwitchInputMock.mockResolvedValue(input);

      await renderPreview({ look: 'heritage' });

      const blocks = capturedProps[0]!.blocks as Array<{ id: number; blockType: string; content: unknown }>;
      const hero = blocks.find((b) => b.blockType === 'hero')!;
      expect(hero.content).toEqual({ headline: 'Harbor Pointe', subtitle: 'Our own words.' });
      expect(hero.id).toBe(100); // the row it came from
      expect(blocks.map((b) => b.blockType)).toContain('board');
    });

    it('leaves a hidden section hidden', async () => {
      const input = siteOn('bayfront');
      const announcementsAt = input.current.findIndex((s) => s.blockType === 'announcements');
      input.current[announcementsAt] = { ...input.current[announcementsAt]!, content: { limit: 3, hidden: true } };
      loadLookSwitchInputMock.mockResolvedValue(input);

      await renderPreview({ look: 'heritage' });

      // Kept by the switch, as the editor keeps it, and left off the page, as the live site does.
      expect(typesOf(capturedProps[0]!)).not.toContain('announcements');
    });

    it('gives every block an id of its own and the plan’s order', async () => {
      await renderPreview({ look: 'heritage' });

      const blocks = capturedProps[0]!.blocks as Array<{ id: number; blockOrder: number }>;
      expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
      expect(blocks.map((b) => b.blockOrder)).toEqual(blocks.map((_, i) => i + 1));
    });

    it('previews a look for a community that has no home page yet', async () => {
      loadLookSwitchInputMock.mockResolvedValue({
        homePageId: null,
        current: [],
        published: new Map(),
        outgoingLayoutId: null,
        outgoingDefaults: [],
        draftedLookId: null,
        live: null,
      });

      await renderPreview({ look: 'heritage' });

      expect(typesOf(capturedProps[0]!)).toEqual(getLook('heritage')!.sections.map((s) => s.blockType));
    });

    it('wins over the wizard’s layout and preset overrides', async () => {
      await renderPreview({ look: 'heritage', layout: 'sable', preset: 'bay-light' });

      expect(getLayoutMock).toHaveBeenCalledWith('heritage');
      expect(vi.mocked(resolveTheme).mock.calls[0]![0]).toMatchObject({
        primaryColor: SITE_LOOK_PRESETS.heritage.primaryColor,
      });
    });

    it('keeps the saved colours when the look’s colour set is not in the catalog, rather than failing', async () => {
      listThemePresetsMock.mockResolvedValue([]);

      await renderPreview({ look: 'heritage' });

      expect(getLayoutMock).toHaveBeenCalledWith('heritage');
      expect(capturedProps).toHaveLength(1);
      expect(vi.mocked(resolveTheme).mock.calls[0]![0]).not.toMatchObject({
        primaryColor: SITE_LOOK_PRESETS.heritage.primaryColor,
      });
    });

    it.each([['nope'], ['sable'], ['HERITAGE'], ['']])(
      'ignores an unknown look (%j): the preview is what it was',
      async (look) => {
        listSiteBlocksMock.mockResolvedValue([
          { id: 5, blockType: 'hero', blockOrder: 1, content: { headline: 'Saved' } },
        ]);

        await renderPreview({ look });

        expect(getLayoutMock).toHaveBeenCalledWith('tidewater');
        expect(loadLookSwitchInputMock).not.toHaveBeenCalled();
        expect(capturedProps[0]!.blocks).toEqual([
          { id: 5, blockType: 'hero', blockOrder: 1, content: { headline: 'Saved' } },
        ]);
      },
    );

    it('without a look, reads the saved blocks and plans nothing', async () => {
      await renderPreview();

      expect(loadLookSwitchInputMock).not.toHaveBeenCalled();
      expect(getHomePageIdMock).toHaveBeenCalledTimes(1);
      expect(listSiteBlocksMock).toHaveBeenCalledTimes(1);
    });

    it('reads no saved rows, and looks up no home page, when it plans one', async () => {
      // The plan is the home page, and `loadLookSwitchInput` finds it itself.
      await renderPreview({ look: 'heritage' });

      expect(getHomePageIdMock).not.toHaveBeenCalled();
      expect(listSiteBlocksMock).not.toHaveBeenCalled();
    });

    // -----------------------------------------------------------------------
    // The colours: what choosing the card would leave (`draftLookSwitch`), by the
    // plan's kind. The card for the LIVE look must not paint colours the live
    // site lacks.
    // -----------------------------------------------------------------------

    describe('colours follow what choosing the card would leave', () => {
      const OWN_PRIMARY = '#AA0000';
      const LIVE_CUSTOM = { secondaryColor: '#334455' };
      const DRAFT_CUSTOM = { primaryColor: '#654321' };

      const stock = (id: LookId) => ({
        layoutId: id,
        themePresetSlug: id,
        primaryColor: SITE_LOOK_PRESETS[id].primaryColor,
        secondaryColor: SITE_LOOK_PRESETS[id].secondaryColor,
        accentColor: SITE_LOOK_PRESETS[id].accentColor,
        fontHeading: SITE_LOOK_PRESETS[id].headingFont,
        fontBody: SITE_LOOK_PRESETS[id].bodyFont,
      });
      const themeOf = (id: LookId, primaryColor = SITE_LOOK_PRESETS[id].primaryColor) => ({
        primaryColor,
        secondaryColor: SITE_LOOK_PRESETS[id].secondaryColor,
        accentColor: SITE_LOOK_PRESETS[id].accentColor,
        fontHeading: SITE_LOOK_PRESETS[id].headingFont,
        fontBody: SITE_LOOK_PRESETS[id].bodyFont,
      });
      const presetRow = (id: LookId) => ({
        id: 1,
        slug: id,
        displayName: id,
        description: null,
        tokens: SITE_LOOK_PRESETS[id],
        tier: 'essentials',
        isFeatured: false,
      });

      /** A live Bayfront site whose manager published their own main colour, with custom colours on top. */
      function liveBayfront(draftLook?: Record<string, unknown>) {
        return {
          ...BRANDING,
          ...stock('bayfront'),
          primaryColor: OWN_PRIMARY,
          customCssOverrides: LIVE_CUSTOM,
          ...(draftLook ? { draftLook } : {}),
        };
      }

      /** Heritage drafted over that site, with its sections in the editor's view. */
      function heritageDraftedOverBayfront() {
        const live = siteOn('bayfront');
        const heritage = getLook('heritage')!.sections;
        return {
          ...live,
          current: heritage.map((section, i) => ({
            id: 200 + i,
            slot: i + 1,
            blockType: section.blockType,
            content: structuredClone(section.content),
          })),
          outgoingLayoutId: 'heritage',
          outgoingDefaults: [heritage],
          draftedLookId: 'heritage' as const,
          live: { ...live.live, otherLayoutDrafted: true },
        };
      }

      /** What the preview painted with: the theme it resolved, and the custom colours it laid on top. */
      function painted() {
        const theme = vi.mocked(resolveTheme).mock.calls[0]![0] as Record<string, unknown>;
        return {
          theme: {
            primaryColor: theme.primaryColor,
            secondaryColor: theme.secondaryColor,
            accentColor: theme.accentColor,
            fontHeading: theme.fontHeading,
            fontBody: theme.fontBody,
          },
          custom: vi.mocked(customCssOverridesToCssVars).mock.calls[0]![0],
        };
      }

      beforeEach(() => {
        listThemePresetsMock.mockResolvedValue((['bayfront', 'heritage'] as const).map(presetRow));
      });

      it('another look: its own colour set and fonts, with the live custom colours kept', async () => {
        getBrandingForCommunityMock.mockResolvedValue(liveBayfront());
        loadLookSwitchInputMock.mockResolvedValue(siteOn('bayfront'));

        await renderPreview({ look: 'heritage' });

        expect(getLayoutMock).toHaveBeenCalledWith('heritage');
        expect(painted()).toEqual({ theme: themeOf('heritage'), custom: LIVE_CUSTOM });
      });

      it('another look: the draft’s custom colours win over the live ones, as in the draft', async () => {
        getBrandingForCommunityMock.mockResolvedValue(liveBayfront({ customCssOverrides: DRAFT_CUSTOM }));
        loadLookSwitchInputMock.mockResolvedValue(siteOn('bayfront'));

        await renderPreview({ look: 'heritage' });

        expect(painted().custom).toEqual(DRAFT_CUSTOM);
      });

      it('the look already drafted: the drafted colours as they are, a colour changed after picking it included', async () => {
        getBrandingForCommunityMock.mockResolvedValue(
          liveBayfront({ ...stock('heritage'), primaryColor: '#0000FF' }),
        );
        loadLookSwitchInputMock.mockResolvedValue(heritageDraftedOverBayfront());

        await renderPreview({ look: 'heritage' });

        expect(getLayoutMock).toHaveBeenCalledWith('heritage');
        expect(painted()).toEqual({ theme: themeOf('heritage', '#0000FF'), custom: LIVE_CUSTOM });
        // Choosing it writes nothing, so its colour set is not laid over the drafted colours.
        expect(listThemePresetsMock).not.toHaveBeenCalled();
      });

      it('the live look: the live site’s own colours, not the look’s stock ones', async () => {
        getBrandingForCommunityMock.mockResolvedValue(liveBayfront());
        loadLookSwitchInputMock.mockResolvedValue(siteOn('bayfront'));

        await renderPreview({ look: 'bayfront' });

        expect(getLayoutMock).toHaveBeenCalledWith('bayfront');
        expect(painted()).toEqual({ theme: themeOf('bayfront', OWN_PRIMARY), custom: LIVE_CUSTOM });
        expect(painted().theme.primaryColor).not.toBe(SITE_LOOK_PRESETS.bayfront.primaryColor);
        expect(listThemePresetsMock).not.toHaveBeenCalled();
      });

      it('the live look: a colour edit that is only pending does not appear on the card that says Live now', async () => {
        getBrandingForCommunityMock.mockResolvedValue(
          liveBayfront({ primaryColor: '#00FF00', customCssOverrides: DRAFT_CUSTOM }),
        );
        loadLookSwitchInputMock.mockResolvedValue(siteOn('bayfront'));

        await renderPreview({ look: 'bayfront' });

        expect(painted()).toEqual({ theme: themeOf('bayfront', OWN_PRIMARY), custom: LIVE_CUSTOM });
      });

      it('back to the live look: the live colours again, plus the draft’s custom colours', async () => {
        getBrandingForCommunityMock.mockResolvedValue(
          liveBayfront({ ...stock('heritage'), customCssOverrides: DRAFT_CUSTOM }),
        );
        loadLookSwitchInputMock.mockResolvedValue(heritageDraftedOverBayfront());

        await renderPreview({ look: 'bayfront' });

        expect(getLayoutMock).toHaveBeenCalledWith('bayfront');
        // The drafted Heritage colours are withdrawn; the manager's own live main colour and
        // the draft's custom colours are what the site has once the card is chosen.
        expect(painted()).toEqual({ theme: themeOf('bayfront', OWN_PRIMARY), custom: DRAFT_CUSTOM });
        expect(listThemePresetsMock).not.toHaveBeenCalled();
      });

      it('back to the live look: the live custom colours when none are drafted', async () => {
        getBrandingForCommunityMock.mockResolvedValue(liveBayfront(stock('heritage')));
        loadLookSwitchInputMock.mockResolvedValue(heritageDraftedOverBayfront());

        await renderPreview({ look: 'bayfront' });

        expect(painted()).toEqual({ theme: themeOf('bayfront', OWN_PRIMARY), custom: LIVE_CUSTOM });
      });
    });
  });
});
