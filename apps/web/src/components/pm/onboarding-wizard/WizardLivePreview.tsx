'use client';

/**
 * Live preview pane for the website wizard's layout/theme steps. Embeds the
 * authenticated, server-rendered /pm/site-preview route in an iframe, passing
 * the CURRENT layout/preset selection as query overrides so the real public-
 * site layout re-renders with each choice. `preview=true` is required so the
 * middleware relaxes the frame headers for same-origin framing.
 */
import { useMemo } from 'react';

interface Props {
  communityId: number;
  layoutId: string | null;
  presetSlug: string | null;
}

export function WizardLivePreview({ communityId, layoutId, presetSlug }: Props) {
  const src = useMemo(() => {
    const qs = new URLSearchParams({ communityId: String(communityId), preview: 'true' });
    if (layoutId) qs.set('layout', layoutId);
    if (presetSlug) qs.set('preset', presetSlug);
    return `/pm/site-preview?${qs.toString()}`;
  }, [communityId, layoutId, presetSlug]);

  return (
    <div
      data-testid="wizard-live-preview"
      className="overflow-hidden rounded-md border border-default bg-surface-card shadow-e0"
    >
      <div className="border-b border-default bg-surface-muted px-3 py-2 text-xs font-medium text-content-secondary">
        Live preview
      </div>
      <iframe
        key={src}
        src={src}
        title="Community site live preview"
        data-testid="wizard-live-preview-frame"
        className="h-[640px] w-full border-0 bg-white"
        loading="lazy"
      />
    </div>
  );
}
