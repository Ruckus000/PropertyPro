import { describe, expect, it } from 'vitest';
import { applyDesignToCanvas } from '@/lib/site-editor/canvas-design';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';

const CONTEXT = {
  community: { id: 1, slug: 's', name: 'Sunset', logoUrl: null, communityType: 'condo_718', city: null, state: null, timezone: 'America/New_York' },
  theme: { primaryColor: '#111111', secondaryColor: '#222222', accentColor: '#333333', headingFont: 'Inter', bodyFont: 'Inter' },
  layout: 'tidewater',
  preview: { announcements: [], documents: [], meetings: [], contact: null },
} as unknown as CanvasContext;

describe('applyDesignToCanvas', () => {
  it('shows the draft look over the live one', () => {
    const next = applyDesignToCanvas(CONTEXT, {
      live: { primaryColor: '#111111', layoutId: 'tidewater' },
      draft: { primaryColor: '#AA0000', layoutId: 'sable', fontHeading: 'Lora' },
    });

    expect(next?.theme.primaryColor).toBe('#AA0000');
    expect(next?.theme.headingFont).toBe('Lora');
    expect(next?.layout).toBe('sable');
    expect(next?.community).toBe(CONTEXT.community);
  });

  it('puts custom colours on top, as the public site does', () => {
    const next = applyDesignToCanvas(CONTEXT, {
      live: { primaryColor: '#111111', customCssOverrides: { primaryColor: '#00AA00', bodyFont: 'Lora' } },
      draft: {},
    });

    expect(next?.theme.primaryColor).toBe('#00AA00');
    expect(next?.theme.bodyFont).toBe('Lora');
  });

  it('keeps the server context until the design has loaded', () => {
    expect(applyDesignToCanvas(CONTEXT, undefined)).toBe(CONTEXT);
    expect(applyDesignToCanvas(null, { live: {}, draft: {} })).toBeNull();
  });
});
