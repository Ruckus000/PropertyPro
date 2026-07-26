'use client';

import { Monitor, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PhoneGateProps {
  /** Public site URL, when the community has one. */
  publicSiteUrl: string | null;
}

/**
 * Shown instead of the editor below 768px.
 *
 * A three-column canvas editor does not work on a phone, and a gate is more
 * honest than a layout that technically renders and cannot be used. The
 * urgent-notice fast path lands here in Phase 7 — the one thing a manager
 * genuinely needs to do from a phone is post a closure notice.
 *
 * This renders the gate content only; the caller decides when to show it, so
 * the editor tree can be unmounted rather than merely hidden (a hidden editor
 * still costs its JS, its autosave timers and its focus stops).
 */
export function PhoneGate({ publicSiteUrl }: PhoneGateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-7 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-interactive text-content-inverse">
        <Monitor className="h-[22px] w-[22px]" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-semibold text-content">Editing needs a bigger screen</h1>
      <p className="max-w-[34ch] text-base leading-relaxed text-content-secondary">
        The website editor works on a laptop or tablet. From your phone you can still view
        your site.
      </p>
      {publicSiteUrl && (
        <Button asChild variant="outline">
          <a href={publicSiteUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            View the public site
          </a>
        </Button>
      )}
    </div>
  );
}
