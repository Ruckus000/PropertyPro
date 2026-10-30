import { describe, it, expect } from 'vitest';
import { liveLook, type CommunityBranding } from '@propertypro/shared';
import {
  resolvePreviewLayoutId,
  applyPresetTokensToBranding,
  plannedSectionsToBlocks,
  resolveLookPreviewBranding,
} from '@/lib/public-site/preview-overrides';
import { getLook, type LookId, type LookSwitchKind } from '@/lib/site-looks/looks';
import { SITE_LOOK_PRESETS } from '../../fixtures/site-look-presets';

describe('resolvePreviewLayoutId', () => {
  it('uses a valid layout override', () => {
    expect(resolvePreviewLayoutId({ layoutId: 'tidewater' }, 'sable', 'condo_718')).toBe('sable');
  });

  it('falls back to the saved branding layout when override is invalid/absent', () => {
    expect(resolvePreviewLayoutId({ layoutId: 'boulevard' }, null, 'condo_718')).toBe('boulevard');
    expect(resolvePreviewLayoutId({ layoutId: 'boulevard' }, 'not-a-layout', 'condo_718')).toBe('boulevard');
  });

  it('falls back to the community-type default when nothing is set', () => {
    expect(resolvePreviewLayoutId(null, null, 'apartment')).toBe('sable');
    expect(resolvePreviewLayoutId(null, undefined, 'condo_718')).toBe('tidewater');
  });
});

describe('applyPresetTokensToBranding', () => {
  it('returns branding unchanged when there are no preset tokens', () => {
    const branding = { primaryColor: '#111111', fontHeading: 'Fraunces' };
    expect(applyPresetTokensToBranding(branding, null)).toBe(branding);
  });

  it('layers preset color + font tokens over branding (preset wins; font names mapped)', () => {
    const branding = { primaryColor: '#111111', secondaryColor: '#222222', fontHeading: 'Fraunces', fontBody: 'Manrope' };
    const result = applyPresetTokensToBranding(branding, {
      primaryColor: '#0e3338',
      accentColor: '#c66f49',
      headingFont: 'Newsreader',
      bodyFont: 'Inter',
    });
    expect(result).toMatchObject({
      primaryColor: '#0e3338', // preset wins
      secondaryColor: '#222222', // untouched (preset didn't set it)
      accentColor: '#c66f49',
      fontHeading: 'Newsreader', // headingFont → fontHeading
      fontBody: 'Inter', // bodyFont → fontBody
    });
  });

  it('works when branding is null (preset-only)', () => {
    const result = applyPresetTokensToBranding(null, { primaryColor: '#abcabc', bodyFont: 'Inter' });
    expect(result).toEqual({ primaryColor: '#abcabc', fontBody: 'Inter' });
  });
});

describe('plannedSectionsToBlocks', () => {
  it('numbers the sections in the order given, as a layout reads them', () => {
    const blocks = plannedSectionsToBlocks([
      { id: 30, blockType: 'hero', content: { headline: 'A' } },
      { id: 12, blockType: 'meetings', content: { limit: 5 } },
      { id: 21, blockType: 'contact', content: {} },
    ]);

    expect(blocks.map((b) => b.blockType)).toEqual(['hero', 'meetings', 'contact']);
    // The plan's order, not the row ids' or the slots' (the planner hands back no slots).
    expect(blocks.map((b) => b.blockOrder)).toEqual([1, 2, 3]);
  });

  it('keeps a section row’s id and content as they are', () => {
    const content = { headline: 'Harbor Pointe', hidden: true };
    const [block] = plannedSectionsToBlocks([{ id: 77, slot: 5, blockType: 'hero', content }]);

    expect(block).toEqual({ id: 77, blockType: 'hero', blockOrder: 1, content });
    expect(block!.content).toBe(content);
  });

  it('gives a section a look supplied an id no section on the page shares', () => {
    const blocks = plannedSectionsToBlocks([
      { blockType: 'hero', content: {} },
      { id: 41, blockType: 'announcements', content: {} },
      { blockType: 'board', content: {} },
      { id: 9, blockType: 'contact', content: {} },
      { blockType: 'quicklinks', content: {} },
    ]);

    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => ![41, 9].includes(id)).every((id) => id > 41)).toBe(true);
    // The kept rows keep theirs.
    expect(blocks[1]!.id).toBe(41);
    expect(blocks[3]!.id).toBe(9);
  });

  it('gives an empty page no blocks', () => {
    expect(plannedSectionsToBlocks([])).toEqual([]);
  });

  it('numbers sections of a page with no rows from 1', () => {
    expect(plannedSectionsToBlocks([{ blockType: 'hero', content: {} }, { blockType: 'contact', content: {} }]).map((b) => b.id)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// resolveLookPreviewBranding: the colours a look's card paints are the colours
// choosing it would leave (`draftLookSwitch`, by the plan's kind).
// ---------------------------------------------------------------------------

describe('resolveLookPreviewBranding', () => {
  /** The look fields of a branding as a renderer reads them: what the card paints. */
  const painted = (branding: CommunityBranding) => liveLook(branding);
  const stock = (id: LookId) => ({
    layoutId: id,
    themePresetSlug: id,
    primaryColor: SITE_LOOK_PRESETS[id].primaryColor,
    secondaryColor: SITE_LOOK_PRESETS[id].secondaryColor,
    accentColor: SITE_LOOK_PRESETS[id].accentColor,
    fontHeading: SITE_LOOK_PRESETS[id].headingFont,
    fontBody: SITE_LOOK_PRESETS[id].bodyFont,
  });
  const resolve = (kind: LookSwitchKind, branding: CommunityBranding, lookId: LookId, withTokens = true) =>
    resolveLookPreviewBranding(kind, branding, getLook(lookId)!, withTokens ? SITE_LOOK_PRESETS[lookId] : null);

  /** A live Bayfront site whose manager published their own main colour, and custom colours on top. */
  const OWN_PRIMARY = '#AA0000';
  const liveBayfront = (extra: Partial<CommunityBranding> = {}): CommunityBranding => ({
    logoPath: 'communities/1/logo.png',
    siteFooter: { associationName: 'Sunset Condominium Association, Inc.', note: null, showStatutoryLine: true },
    ...stock('bayfront'),
    primaryColor: OWN_PRIMARY,
    customCssOverrides: { secondaryColor: '#334455' },
    ...extra,
  });
  /** Heritage drafted over it, as `draftLookSwitch` writes it. */
  const heritageDraft = stock('heritage');

  describe('switch', () => {
    it("paints the look's own colour set, layout and slug over the live site's colours", () => {
      expect(painted(resolve('switch', liveBayfront(), 'heritage'))).toMatchObject(stock('heritage'));
    });

    it('keeps the live custom colours, as the draft does (it never drafts them)', () => {
      expect(painted(resolve('switch', liveBayfront(), 'heritage')).customCssOverrides).toEqual({
        secondaryColor: '#334455',
      });
    });

    it('keeps drafted custom colours over live ones, and a drafted clear (null) clears them', () => {
      const custom = liveBayfront({ draftLook: { customCssOverrides: { primaryColor: '#654321' } } });
      expect(painted(resolve('switch', custom, 'heritage')).customCssOverrides).toEqual({ primaryColor: '#654321' });

      const cleared = liveBayfront({ draftLook: { customCssOverrides: null } });
      expect(painted(resolve('switch', cleared, 'heritage')).customCssOverrides).toBeNull();
    });

    it('lays the colour set over colours drafted for another look', () => {
      const palmGrove = liveBayfront({ draftLook: { ...stock('palm-grove'), primaryColor: '#0000FF' } });
      expect(painted(resolve('switch', palmGrove, 'heritage'))).toMatchObject(stock('heritage'));
    });

    it("keeps the colours the community has when the look's colour set is not in the catalog", () => {
      const result = painted(resolve('switch', liveBayfront(), 'heritage', false));
      expect(result).toMatchObject({ layoutId: 'heritage', themePresetSlug: 'heritage', primaryColor: OWN_PRIMARY });
    });
  });

  describe('already-drafted', () => {
    it('is the drafted look as it stands, including a colour changed after picking it', () => {
      const drafted = liveBayfront({ draftLook: { ...heritageDraft, primaryColor: '#0000FF' } });
      expect(painted(resolve('already-drafted', drafted, 'heritage'))).toMatchObject({
        ...heritageDraft,
        primaryColor: '#0000FF',
      });
    });

    it('does not bring the look colour set again', () => {
      const drafted = liveBayfront({ draftLook: { ...heritageDraft, primaryColor: '#0000FF' } });
      expect(painted(resolve('already-drafted', drafted, 'heritage')).primaryColor).not.toBe(
        SITE_LOOK_PRESETS.heritage.primaryColor,
      );
    });
  });

  describe('live-look', () => {
    it("is the live site's own colours, not the look's stock ones", () => {
      const result = painted(resolve('live-look', liveBayfront(), 'bayfront'));
      expect(result.primaryColor).toBe(OWN_PRIMARY);
      expect(result.primaryColor).not.toBe(SITE_LOOK_PRESETS.bayfront.primaryColor);
      expect(result.customCssOverrides).toEqual({ secondaryColor: '#334455' });
    });

    it('leaves a pending colour edit off the card that says Live now', () => {
      // The edit stays pending (choosing this card writes nothing), but it is not live.
      const pending = liveBayfront({ draftLook: { primaryColor: '#00FF00', customCssOverrides: { primaryColor: '#111111' } } });
      const result = painted(resolve('live-look', pending, 'bayfront'));
      expect(result.primaryColor).toBe(OWN_PRIMARY);
      expect(result.customCssOverrides).toEqual({ secondaryColor: '#334455' });
    });
  });

  describe('back-to-live', () => {
    const drafted = (extra: Partial<NonNullable<CommunityBranding['draftLook']>> = {}) =>
      liveBayfront({ draftLook: { ...heritageDraft, ...extra } });

    it('is the live look again: the drafted layout, colour set, colours and fonts are withdrawn', () => {
      const result = painted(resolve('back-to-live', drafted(), 'bayfront'));
      expect(result).toMatchObject({ ...stock('bayfront'), primaryColor: OWN_PRIMARY });
      expect(result.themePresetSlug).toBe('bayfront');
    });

    it("keeps the draft's custom colours, which the switch never withdraws", () => {
      const withCustom = drafted({ customCssOverrides: { primaryColor: '#654321' } });
      expect(painted(resolve('back-to-live', withCustom, 'bayfront')).customCssOverrides).toEqual({
        primaryColor: '#654321',
      });
      const cleared = drafted({ customCssOverrides: null });
      expect(painted(resolve('back-to-live', cleared, 'bayfront')).customCssOverrides).toBeNull();
    });

    it('falls back to the live custom colours when none are drafted', () => {
      expect(painted(resolve('back-to-live', drafted(), 'bayfront')).customCssOverrides).toEqual({
        secondaryColor: '#334455',
      });
    });
  });

  it.each<LookSwitchKind>(['switch', 'already-drafted', 'live-look', 'back-to-live'])(
    '%s leaves everything that is not the look alone, and never changes its input',
    (kind) => {
      const input = liveBayfront({ draftLook: { ...heritageDraft } });
      const before = structuredClone(input);

      const result = resolve(kind, input, kind === 'switch' || kind === 'already-drafted' ? 'heritage' : 'bayfront');

      expect(input).toEqual(before);
      expect(result.logoPath).toBe('communities/1/logo.png');
      expect(result.siteFooter).toEqual(before.siteFooter);
      // A renderer never sees the draft.
      expect(result).not.toHaveProperty('draftLook');
    },
  );
});
