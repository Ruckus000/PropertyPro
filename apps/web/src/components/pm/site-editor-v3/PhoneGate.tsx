'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Monitor, ExternalLink, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UrgentNotice } from '@/hooks/use-urgent-notice';

// Loaded on tap, not on mount.
//
// PhoneGate itself is imported statically by EditorShell, so anything this file
// imports at the top level lands in the editor's initial payload — for every
// desktop PM, who will never see this screen. The route has ~43 KiB of headroom
// against a 700 KiB HARD budget, so the form (and the Radix alert-dialog stack
// behind its confirmation) is deferred behind the button.
const UrgentNoticeForm = dynamic(
  () => import('./panels/UrgentNoticeForm').then((m) => m.UrgentNoticeForm),
  { loading: () => <p className="text-sm text-content-secondary">Loading…</p> },
);

export interface PhoneGateProps {
  /** Public site URL, when the community has one. */
  publicSiteUrl: string | null;
  communityId: number;
  /** Whether the site has ever been published — a notice needs somewhere to show. */
  hasPublishedSite: boolean;
  /** Server-rendered current notice, so the form opens with real state. */
  initialNotice: UrgentNotice | null;
}

/**
 * Shown instead of the editor below 768px.
 *
 * A three-column canvas editor does not work on a phone, and a gate is more
 * honest than a layout that technically renders and cannot be used.
 *
 * But one job genuinely belongs on a phone: posting a closure notice. That is
 * the case the urgent notice exists for — a manager standing in front of a
 * flooded lobby, not at a desk. So the gate turns away editing and keeps that
 * one path open.
 *
 * This renders the gate content only; the caller decides when to show it, so
 * the editor tree can be unmounted rather than merely hidden (a hidden editor
 * still costs its JS, its autosave timers and its focus stops).
 */
export function PhoneGate({
  publicSiteUrl,
  communityId,
  hasPublishedSite,
  initialNotice,
}: PhoneGateProps) {
  const [noticeOpen, setNoticeOpen] = useState(false);

  if (noticeOpen) {
    return (
      <div className="h-full overflow-y-auto px-5 py-6">
        <h1 className="text-lg font-semibold text-content">Post an urgent notice</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Shows on every page of your public website, straight away.
        </p>
        <div className="mt-5">
          <UrgentNoticeForm
            communityId={communityId}
            hasPublishedSite={hasPublishedSite}
            initialNotice={initialNotice}
            compact
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          className="mt-6"
          onClick={() => setNoticeOpen(false)}
        >
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-7 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-interactive text-content-inverse">
        <Monitor className="h-[22px] w-[22px]" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-semibold text-content">Editing needs a bigger screen</h1>
      <p className="max-w-[34ch] text-base leading-relaxed text-content-secondary">
        The website editor works on a laptop or tablet. From your phone you can still post an
        urgent notice and view your site.
      </p>
      <Button type="button" onClick={() => setNoticeOpen(true)}>
        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
        Post an urgent notice
      </Button>
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
