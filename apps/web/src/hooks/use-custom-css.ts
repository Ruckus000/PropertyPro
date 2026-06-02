'use client';

/**
 * Focused mutation for the Pro+ Custom Styling form: PATCHes ONLY
 * customCssOverrides on /api/v1/pm/branding so it never clobbers the other
 * branding fields (colors/fonts/logo) the full BrandingForm owns. The branding
 * route validates + plan-gates (hasSiteCustomCss) server-side.
 *
 * Raw fetch (not requestJson) to render the thrown `.message` verbatim, matching
 * use-branding-form.ts.
 */
import { useMutation } from '@tanstack/react-query';
import type { CustomCssOverrides } from '@propertypro/shared';

export interface SaveCustomCssInput {
  communityId: number;
  /** The override token set, or null to clear all overrides. */
  customCssOverrides: CustomCssOverrides | null;
}

export function useSaveCustomCss() {
  return useMutation<void, Error, SaveCustomCssInput>({
    mutationFn: async ({ communityId, customCssOverrides }) => {
      const res = await fetch('/api/v1/pm/branding', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, customCssOverrides }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Failed to save custom styling');
      }
    },
  });
}
