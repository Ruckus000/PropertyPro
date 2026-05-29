'use client';

/**
 * Wizard backing hook.
 *
 * Wraps PATCH /api/v1/pm/onboarding/website. On success, invalidates the
 * branding-related caches so any open editor surface refetches.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface WizardPatch {
  layoutId?: string | null;
  themePresetSlug?: string | null;
  tagline?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontHeading?: string;
  fontBody?: string;
}

export interface WizardBrandingState {
  layoutId: string | null;
  themePresetSlug: string | null;
  tagline: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  fontHeading: string | null;
  fontBody: string | null;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed (HTTP ${res.status})`;
  } catch {
    return `Request failed (HTTP ${res.status})`;
  }
}

export function useWebsiteWizard(communityId: number) {
  const qc = useQueryClient();
  return useMutation<WizardBrandingState, Error, WizardPatch>({
    mutationFn: async (patch) => {
      const res = await fetch('/api/v1/pm/onboarding/website', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...patch }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { data: { branding: WizardBrandingState } };
      return body.data.branding;
    },
    onSuccess: async () => {
      // Editor surfaces that show blocks or hero re-render against the
      // new branding choices.
      await qc.invalidateQueries({ queryKey: ['pm', 'site', 'blocks', communityId] });
      await qc.invalidateQueries({ queryKey: ['pm', 'site', 'hero', communityId] });
    },
  });
}
