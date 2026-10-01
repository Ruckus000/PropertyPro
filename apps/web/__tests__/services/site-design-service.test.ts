/**
 * The site's look saved as a draft (website builder v4). The SQL merge itself
 * is covered by the integration test; this pins what is written and why.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getBrandingMock, listPresetsMock, mergeBrandingMock, logAuditEventMock } = vi.hoisted(
  () => ({
    getBrandingMock: vi.fn(),
    listPresetsMock: vi.fn(),
    mergeBrandingMock: vi.fn(),
    logAuditEventMock: vi.fn(),
  }),
);

vi.mock('@propertypro/db', () => ({ logAuditEvent: logAuditEventMock }));
vi.mock('@/lib/api/branding', () => ({ getBrandingForCommunity: getBrandingMock }));
vi.mock('@/lib/db/theme-preset-catalog', () => ({ listThemePresetsForWizard: listPresetsMock }));
vi.mock('@/lib/services/site-settings-service', () => ({ mergeBranding: mergeBrandingMock }));

import { getSiteDesign, saveDraftDesign } from '@/lib/services/site-design-service';

const ACTOR = { actorUserId: 'user-1' };

beforeEach(() => {
  vi.clearAllMocks();
  getBrandingMock.mockResolvedValue({ layoutId: 'tidewater', primaryColor: '#111111', logoPath: 'l.webp' });
  listPresetsMock.mockResolvedValue([
    {
      slug: 'gulf-warm',
      tokens: { primaryColor: '#AA5500', accentColor: '#FFCC00', headingFont: 'Lora', bodyFont: 'Inter' },
    },
  ]);
});

describe('saveDraftDesign', () => {
  it('writes a chosen colour set with its colours and fonts, not just its name', async () => {
    // Storing only the slug is how the wizard's choice never reached the live
    // site: `resolveTheme` reads the colour and font fields.
    await saveDraftDesign(42, { themePresetSlug: 'gulf-warm' }, ACTOR);

    expect(mergeBrandingMock).toHaveBeenCalledWith(42, {
      draftLook: {
        themePresetSlug: 'gulf-warm',
        primaryColor: '#AA5500',
        accentColor: '#FFCC00',
        fontHeading: 'Lora',
        fontBody: 'Inter',
      },
    });
  });

  it('lets colours sent alongside a colour set win over the set', async () => {
    await saveDraftDesign(42, { themePresetSlug: 'gulf-warm', primaryColor: '#000000' }, ACTOR);
    expect(mergeBrandingMock.mock.calls[0]?.[1].draftLook.primaryColor).toBe('#000000');
  });

  it('refuses a colour set that does not exist, before writing', async () => {
    await expect(saveDraftDesign(42, { themePresetSlug: 'nope' }, ACTOR)).rejects.toThrow(
      /colour set/,
    );
    expect(mergeBrandingMock).not.toHaveBeenCalled();
  });

  it('refuses a layout the public site cannot render, before writing', async () => {
    await expect(saveDraftDesign(42, { layoutId: 'harbor' }, ACTOR)).rejects.toThrow(/layout/);
    expect(mergeBrandingMock).not.toHaveBeenCalled();
  });

  it('returns the pending change and audits it', async () => {
    const result = await saveDraftDesign(42, { layoutId: 'boulevard' }, ACTOR);

    expect(result).toEqual({
      live: { layoutId: 'tidewater', primaryColor: '#111111' },
      draft: { layoutId: 'boulevard' },
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'site_design_draft_saved',
        communityId: 42,
        newValues: { draftLook: { layoutId: 'boulevard' } },
      }),
    );
  });
});

describe('getSiteDesign', () => {
  it('reports a draft equal to the live look as nothing pending', async () => {
    getBrandingMock.mockResolvedValue({ layoutId: 'tidewater', draftLook: { layoutId: 'tidewater' } });
    expect(await getSiteDesign(42)).toEqual({ live: { layoutId: 'tidewater' }, draft: {} });
  });
});
