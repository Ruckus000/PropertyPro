/**
 * The site's look saved as a draft (website builder v4). The SQL merge itself
 * is covered by the integration test; this pins what is written and why.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getBrandingMock,
  listPresetsMock,
  mergeBrandingMock,
  logAuditEventMock,
  createScopedClientMock,
  scopedQueryMock,
} = vi.hoisted(() => ({
  getBrandingMock: vi.fn(),
  listPresetsMock: vi.fn(),
  mergeBrandingMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  scopedQueryMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  createScopedClient: createScopedClientMock,
  communities: { id: 'communities.id', branding: 'communities.branding' },
}));
vi.mock('@propertypro/db/filters', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: [...strings], values }),
}));
vi.mock('@/lib/api/branding', () => ({ getBrandingForCommunity: getBrandingMock }));
vi.mock('@/lib/db/theme-preset-catalog', () => ({ listThemePresetsForWizard: listPresetsMock }));
vi.mock('@/lib/services/site-settings-service', () => ({ mergeBranding: mergeBrandingMock }));

import {
  getSiteDesign,
  saveDraftDesign,
  withdrawDraftDesign,
  writeDraftDesign,
} from '@/lib/services/site-design-service';

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

describe('writeDraftDesign', () => {
  it('reads, writes and audits on the transaction it is given', async () => {
    // A look switch saves the look with the sections it drafts, in one
    // transaction: every statement of the save has to run on that handle.
    const tx = { transaction: 'handle' };
    createScopedClientMock.mockReturnValue({ query: scopedQueryMock });
    scopedQueryMock.mockResolvedValue([{ branding: { layoutId: 'tidewater', primaryColor: '#111111' } }]);

    const result = await writeDraftDesign(42, { layoutId: 'boulevard' }, { ...ACTOR, executor: tx as never });

    expect(createScopedClientMock).toHaveBeenCalledWith(42, tx);
    expect(getBrandingMock).not.toHaveBeenCalled();
    expect(mergeBrandingMock).toHaveBeenCalledWith(42, { draftLook: { layoutId: 'boulevard' } }, tx);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'site_design_draft_saved', communityId: 42 }),
      tx,
    );
    expect(result).toEqual({
      live: { layoutId: 'tidewater', primaryColor: '#111111' },
      draft: { layoutId: 'boulevard' },
    });
  });
});

describe('withdrawDraftDesign', () => {
  const drafted = {
    layoutId: 'bayfront',
    primaryColor: '#111111',
    draftLook: { layoutId: 'heritage', primaryColor: '#222222', customCssOverrides: { colorPrimary: '#333333' } },
  };

  it('drops the drafted fields on the transaction it is given, so they are no longer pending', async () => {
    const executor = { execute: vi.fn(async (_query: unknown) => []) };
    createScopedClientMock.mockReturnValue({ query: scopedQueryMock });
    scopedQueryMock.mockResolvedValue([{ branding: drafted }]);

    const result = await withdrawDraftDesign(42, ['layoutId', 'primaryColor', 'fontBody'], {
      ...ACTOR,
      executor: executor as never,
    });

    expect(createScopedClientMock).toHaveBeenCalledWith(42, executor);
    const update = JSON.stringify(executor.execute.mock.calls[0]?.[0]);
    expect(update).toContain('draftLook');
    // Only what is drafted is withdrawn; custom colours stay drafted.
    expect(update).toContain('layoutId');
    expect(update).toContain('primaryColor');
    expect(update).not.toContain('fontBody');
    expect(result).toEqual({
      live: { layoutId: 'bayfront', primaryColor: '#111111' },
      draft: { customCssOverrides: { colorPrimary: '#333333' } },
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'site_design_draft_saved',
        newValues: { draftLook: { customCssOverrides: { colorPrimary: '#333333' } } },
      }),
      executor,
    );
  });

  it('writes nothing when none of the fields is drafted', async () => {
    const executor = { execute: vi.fn(async (_query: unknown) => []) };
    createScopedClientMock.mockReturnValue({ query: scopedQueryMock });
    scopedQueryMock.mockResolvedValue([{ branding: drafted }]);

    await withdrawDraftDesign(42, ['fontHeading'], { ...ACTOR, executor: executor as never });

    expect(executor.execute).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

describe('getSiteDesign', () => {
  it('reports a draft equal to the live look as nothing pending', async () => {
    getBrandingMock.mockResolvedValue({ layoutId: 'tidewater', draftLook: { layoutId: 'tidewater' } });
    expect(await getSiteDesign(42)).toEqual({ live: { layoutId: 'tidewater' }, draft: {} });
  });
});
