/**
 * A new community's website, against real Postgres: its suggested look, live
 * from the moment the community exists.
 *
 * Two entry points give a community its site:
 *   - `seedNewCommunitySite`, which both creation paths call (`createCommunityForPm`
 *     and signup provisioning's `community_created` step);
 *   - `fillDemoCommunitySite`, which a prospect demo's first entry calls.
 * Both end in `applyLookAtCreation`. The unit suite checks which statements run;
 * these cases check what they leave behind, and what a visitor then sees.
 *
 * The public page is rendered from the same real parts `app/public-site` hands its
 * layout (community facts, branding, the home page's published sections), because
 * the page itself reads request headers, which no test here can supply without
 * mocking them. The layout and every section run for real, including the async
 * Documents section that reads the database.
 *
 * Nothing is mocked — no-mock-guard forbids it under __tests__/integration/.
 * Run with `pnpm test:integration:local`. NEVER against `.env.local`: that
 * DATABASE_URL is production.
 */
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { createElement } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { effectiveLook, type CommunityType } from '@propertypro/shared';
import { resolveTheme } from '@propertypro/theme';
import { getBrandingForCommunity, getCommunityPublicInfo } from '@/lib/api/branding';
import { getLayout } from '@/components/public-site/layouts/registry';
import { getPublicCommunityScopedReader } from '@/lib/db/public-community-reader';
import { createCommunityForPm } from '@/lib/pm/create-community';
import { resolveLayoutId } from '@/lib/public-site/layout-resolver';
import { applyLookAtCreation, fillDemoCommunitySite } from '@/lib/services/site-look-service';
import { seedNewCommunitySite } from '@/lib/services/new-community-site';
import { ensureHomePage } from '@/lib/services/site-pages-service';
import { getLook, suggestedLookFor, type LookId } from '@/lib/site-looks/looks';
import { visibleBlocks } from '@/lib/site/visible-blocks';
import { resolveFooterSettings } from '@/lib/site-editor/site-settings';
import { SITE_LOOK_PRESETS } from '../fixtures/site-look-presets';
import {
  type TestKitState,
  initTestKit,
  teardownTestKit,
  trackCommunityForCleanup,
  trackUserForCleanup,
  requireDatabaseUrlInCI,
  getDescribeDb,
} from './helpers/multi-tenant-test-kit';

requireDatabaseUrlInCI('New community look integration tests');

const describeDb = getDescribeDb();

interface Section {
  blockType: string;
  content: unknown;
}

/**
 * The brand an admin's demo form collects (three colours and two fonts, all
 * required, and an optional logo), which `seedCommunity` stores as the demo's
 * branding. The demo wears it.
 */
const PROSPECT_BRAND = {
  primaryColor: '#7A1F3D',
  secondaryColor: '#F4E9D8',
  accentColor: '#2F6F5E',
  fontHeading: 'Lora',
  fontBody: 'Inter',
  logoPath: '123/logo/prospect.webp',
};

/** Renders a tree to HTML, waiting for async sections (a renderToString would not). */
function renderToHtml(element: Parameters<typeof renderToPipeableStream>[0]): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
      final(callback) {
        resolve(chunks.join(''));
        callback();
      },
    });
    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(sink);
      },
      onShellError: reject,
      onError: reject,
    });
  });
}

describeDb('new communities and prospect demos start with their suggested look (db-backed integration)', () => {
  let state: TestKitState;
  /** The founding manager of every community made through `createCommunityForPm`. */
  let creatorId: string;
  const inAWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  function lookSections(id: LookId): Section[] {
    const look = getLook(id);
    if (!look) throw new Error(`No look "${id}"`);
    return look.sections.map(({ blockType, content }) => ({ blockType, content }));
  }

  /** The branding a look writes: its layout and colour set, and the set's colours and fonts. */
  function lookBranding(id: LookId) {
    const tokens = SITE_LOOK_PRESETS[id];
    return {
      layoutId: id,
      themePresetSlug: id,
      primaryColor: tokens.primaryColor,
      secondaryColor: tokens.secondaryColor,
      accentColor: tokens.accentColor,
      fontHeading: tokens.headingFont,
      fontBody: tokens.bodyFont,
    };
  }

  async function createCommunity(
    label: string,
    opts: { type?: CommunityType; isDemo?: boolean; branding?: Record<string, unknown> } = {},
  ): Promise<number> {
    const isDemo = opts.isDemo ?? false;
    const [row] = await state.db
      .insert(state.dbModule.communities)
      .values({
        name: `New look ${label} ${state.runSuffix}`,
        slug: `new-look-${label}-${state.runSuffix}`,
        communityType: opts.type ?? 'condo_718',
        timezone: 'America/New_York',
        ...(opts.branding ? { branding: opts.branding } : {}),
        isDemo,
        // enforce_demo_timestamps: a demo carries both.
        ...(isDemo ? { trialEndsAt: inAWeek(), demoExpiresAt: inAWeek() } : {}),
      })
      .returning({ id: state.dbModule.communities.id });
    if (!row) throw new Error(`Failed to create community "${label}"`);
    trackCommunityForCleanup(state, row.id);
    return row.id;
  }

  /** The home page a visitor sees: published sections in slot order. */
  async function liveSections(communityId: number): Promise<Section[]> {
    const { siteBlocks } = state.dbModule;
    return state.db
      .select({ blockType: siteBlocks.blockType, content: siteBlocks.content })
      .from(siteBlocks)
      .where(
        and(
          eq(siteBlocks.communityId, communityId),
          eq(siteBlocks.isDraft, false),
          isNull(siteBlocks.deletedAt),
        ),
      )
      .orderBy(asc(siteBlocks.blockOrder));
  }

  async function readCommunity(communityId: number) {
    const { communities } = state.dbModule;
    const [row] = await state.db
      .select({
        branding: communities.branding,
        sitePublishedAt: communities.sitePublishedAt,
        siteOnboardingCompletedAt: communities.siteOnboardingCompletedAt,
      })
      .from(communities)
      .where(eq(communities.id, communityId));
    if (!row) throw new Error('Community not found');
    return { ...row, branding: (row.branding ?? {}) as Record<string, unknown> };
  }

  async function homePages(communityId: number) {
    const { sitePages } = state.dbModule;
    return state.db
      .select({ isHome: sitePages.isHome, isDraft: sitePages.isDraft, publishedAt: sitePages.publishedAt })
      .from(sitePages)
      .where(and(eq(sitePages.communityId, communityId), isNull(sitePages.deletedAt)));
  }

  /**
   * A community made the way a manager makes one: the real `createCommunityForPm`
   * (the community, its founding membership and checklist), then its website.
   */
  async function provisionCommunity(
    label: string,
    communityType: CommunityType,
  ): Promise<{ communityId: number; name: string }> {
    const name = `New look ${label} ${state.runSuffix}`;
    const { communityId } = await createCommunityForPm({
      userId: creatorId,
      name,
      communityType,
      addressLine1: '100 Palm Way',
      city: 'Miami',
      state: 'FL',
      zipCode: '33101',
      subdomain: `new-look-${label}-${state.runSuffix}`,
      timezone: 'America/New_York',
      unitCount: 120,
    });
    trackCommunityForCleanup(state, communityId);
    return { communityId, name };
  }

  /**
   * What a visitor must not see on a fresh site. Nothing has been posted yet, so
   * the Documents section has nothing to list and no record to summarise, and is
   * left out rather than shown with an empty-list message; the empty meetings and
   * news sections are left out too. And no linked-field token reaches a visitor,
   * resolved or not.
   */
  function expectNoPlaceholders(html: string): void {
    expect(html).not.toContain('No documents available.');
    expect(html).not.toContain('No upcoming meetings.');
    expect(html).not.toContain('No announcements yet.');
    expect(html).not.toContain('{{');
  }

  /**
   * The public home page as a visitor gets it, from the parts the page hands its
   * layout (`app/public-site/[[...slug]]/page.tsx`): the community's public facts,
   * its published look, and the home page's visible published sections.
   */
  async function renderPublicHome(communityId: number): Promise<string> {
    const community = await getCommunityPublicInfo(communityId);
    if (!community) throw new Error(`No public community ${communityId}`);
    const communityType = community.communityType as CommunityType;
    const saved = await getBrandingForCommunity(communityId);
    const branding = saved ? effectiveLook(saved, { includeDraft: false }) : null;
    const theme = resolveTheme(branding, community.name, communityType);
    const Layout = getLayout(resolveLayoutId(branding, communityType));
    if (!Layout) throw new Error('The community has no layout to render');

    const reader = getPublicCommunityScopedReader(communityId);
    const pageId = await reader.getHomePageId();
    const blocks = visibleBlocks(
      await reader.listSiteBlocks({ includeDrafts: false, ...(pageId === null ? {} : { pageId }) }),
    );
    return renderToHtml(
      createElement(Layout, {
        community: {
          id: community.id,
          slug: community.slug,
          name: community.name,
          shortName: community.shortName,
          logoUrl: null,
          communityType,
          city: community.city,
          state: community.state,
          unitCount: community.unitCount,
          timezone: 'America/New_York',
        },
        theme: {
          primaryColor: theme.primaryColor,
          secondaryColor: theme.secondaryColor,
          accentColor: theme.accentColor,
          headingFont: theme.fontHeading,
          bodyFont: theme.fontBody,
        },
        blocks: blocks.map((b) => ({
          id: b.id,
          blockType: b.blockType,
          blockOrder: b.blockOrder,
          content: b.content,
        })),
        footer: resolveFooterSettings(branding),
        nav: { items: await reader.listNavPages(), currentSlug: '' },
        page: undefined,
      }),
    );
  }

  beforeAll(async () => {
    state = await initTestKit();
    creatorId = randomUUID();
    await state.db.insert(state.dbModule.users).values({
      id: creatorId,
      email: `new-look-creator-${state.runSuffix}@example.com`,
      fullName: `New look creator ${state.runSuffix}`,
      phone: null,
    });
    trackUserForCleanup(state, creatorId);
  });

  afterAll(async () => {
    if (state) await teardownTestKit(state);
  });

  it('a freshly provisioned condo\'s public page shows no "No documents available." and no "{{"', async () => {
    const { communityId, name } = await provisionCommunity('condo', 'condo_718');

    const html = await renderPublicHome(communityId);

    // Bayfront drew it, and the hero's linked fields resolved: the headline
    // names the community and the subtitle carries sign-up's city and unit count.
    expect(html).toContain('data-layout="bayfront"');
    expect(html).toContain(`Welcome to ${name}`);
    expect(html).toContain('120 homes in Miami.');
    expectNoPlaceholders(html);
    // A real page, not an empty shell: the address given at creation is on it.
    expect(html).toContain('100 Palm Way, Miami, FL 33101');
  });

  it('each community type\'s freshly provisioned public page shows its own look, with no empty-list text and no "{{"', async () => {
    const plainSimpleSubtitle = (getLook('plain-simple')?.sections[0]?.content as { subtitle: string }).subtitle;
    const cases: Array<{
      type: CommunityType;
      label: string;
      layout: LookId;
      headline: (name: string) => string;
      /** What only this look's hero says; for a look with linked fields, the facts they resolved to. */
      subtitle: string;
    }> = [
      { type: 'condo_718', label: 'page-condo', layout: 'bayfront', headline: (n) => `Welcome to ${n}`, subtitle: '120 homes in Miami.' },
      { type: 'hoa_720', label: 'page-hoa', layout: 'palm-grove', headline: (n) => `Welcome home to ${n}`, subtitle: '120 homes in Miami.' },
      // Plain & Simple's welcome has no linked fields, so it reads the same with or without facts.
      { type: 'apartment', label: 'page-apartment', layout: 'plain-simple', headline: (n) => `Welcome to ${n}`, subtitle: plainSimpleSubtitle },
    ];
    expect(plainSimpleSubtitle).not.toContain('{{');

    for (const { type, label, layout, headline, subtitle } of cases) {
      const { communityId, name } = await provisionCommunity(label, type);

      const html = await renderPublicHome(communityId);

      expect(suggestedLookFor(type)).toBe(layout);
      expect(html, `${type}: layout`).toContain(`data-layout="${layout}"`);
      expect(html, `${type}: headline`).toContain(headline(name));
      expect(html, `${type}: subtitle`).toContain(subtitle);
      expectNoPlaceholders(html);
    }
  });

  it('each community type goes live with its suggested look: layout, colours, fonts and published sections', async () => {
    const cases: Array<{ type: CommunityType; look: LookId }> = [
      { type: 'condo_718', look: 'bayfront' },
      { type: 'hoa_720', look: 'palm-grove' },
      { type: 'apartment', look: 'plain-simple' },
    ];
    for (const { type, look } of cases) {
      expect(suggestedLookFor(type)).toBe(look);
      const communityId = await createCommunity(`type-${look}`, { type });

      await seedNewCommunitySite(communityId, type);

      const community = await readCommunity(communityId);
      expect(community.branding).toMatchObject(lookBranding(look));
      expect(await liveSections(communityId)).toEqual(lookSections(look));
      // One published home page, and the site reads as published from the
      // sections' own moment (the urgent-notice gate and admin's status read it).
      expect(await homePages(communityId)).toEqual([
        { isHome: true, isDraft: false, publishedAt: expect.any(Date) },
      ]);
      expect(community.sitePublishedAt).toBeInstanceOf(Date);
      // Going live is not "chose a look": the dashboard still offers to pick another.
      expect(community.siteOnboardingCompletedAt).toBeNull();
    }
  });

  it('seeding a community again leaves the site it has, however often provisioning retries', async () => {
    const communityId = await createCommunity('retry', { type: 'condo_718' });
    await seedNewCommunitySite(communityId, 'condo_718');
    const first = await readCommunity(communityId);

    await seedNewCommunitySite(communityId, 'condo_718');
    await seedNewCommunitySite(communityId, 'condo_718');

    expect(await liveSections(communityId)).toEqual(lookSections('bayfront'));
    expect((await readCommunity(communityId)).sitePublishedAt).toEqual(first.sitePublishedAt);
  });

  it('first entries that race publish the look once, and a draft home page goes live with it', async () => {
    const communityId = await createCommunity('race', { isDemo: true });
    // A demo whose editor was opened before it had a site: the first editor load
    // created a draft home page with nothing on it.
    await ensureHomePage(communityId);

    // Called directly, not through the demo wrapper, which swallows errors: the
    // section-order unique index would stop a second copy, but only by failing the
    // losing entry. The row lock makes every racer succeed.
    const results = await Promise.all([
      applyLookAtCreation(communityId, 'condo_718'),
      applyLookAtCreation(communityId, 'condo_718'),
      applyLookAtCreation(communityId, 'condo_718'),
    ]);

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(await liveSections(communityId)).toEqual(lookSections('bayfront'));
    expect(await homePages(communityId)).toEqual([
      { isHome: true, isDraft: false, publishedAt: expect.any(Date) },
    ]);
  });

  it('a prospect demo with no section rows gets its suggested look, in the prospect\'s own colours', async () => {
    const communityId = await createCommunity('demo', {
      type: 'hoa_720',
      isDemo: true,
      branding: PROSPECT_BRAND,
    });

    await fillDemoCommunitySite(communityId);

    expect(await liveSections(communityId)).toEqual(lookSections('palm-grove'));
    const { branding, sitePublishedAt } = await readCommunity(communityId);
    // The look's layout and colour set, but the brand the admin typed in is still
    // the demo's: its dashboard, mobile preview and website all wear it.
    expect(branding).toMatchObject({ layoutId: 'palm-grove', themePresetSlug: 'palm-grove', ...PROSPECT_BRAND });
    expect(sitePublishedAt).toBeInstanceOf(Date);
  });

  it('a demo with any section row, even a removed one, is left alone', async () => {
    const communityId = await createCommunity('emptied', { type: 'condo_718', isDemo: true });
    await fillDemoCommunitySite(communityId);
    expect((await liveSections(communityId)).length).toBeGreaterThan(0);
    // Removing a section soft-deletes it (removeSiteBlock).
    const { siteBlocks } = state.dbModule;
    await state.db.update(siteBlocks).set({ deletedAt: new Date() }).where(eq(siteBlocks.communityId, communityId));

    await fillDemoCommunitySite(communityId);

    expect(await liveSections(communityId)).toEqual([]);
  });

  it("a community that isn't a demo is left alone", async () => {
    const communityId = await createCommunity('real', { type: 'condo_718', isDemo: false });

    await fillDemoCommunitySite(communityId);

    expect(await liveSections(communityId)).toEqual([]);
    expect((await readCommunity(communityId)).branding).toEqual({});
  });
});
