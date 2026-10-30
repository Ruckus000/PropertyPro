'use client';

import { UrgentNoticeForm } from './UrgentNoticeForm';
import type { UrgentNotice } from '@/hooks/use-urgent-notice';

export interface UrgentNoticePanelProps {
  communityId: number;
  hasPublishedSite: boolean;
  initialNotice: UrgentNotice | null;
}

/**
 * Site settings' Notice tab.
 *
 * A thin wrapper over `UrgentNoticeForm` — the heading is the tab's card title
 * (`SettingsView`), and the form is shared verbatim with the phone gate. The
 * wrapper exists so the tab has a single lazy import to hang on, and so the
 * desktop surface can carry the one bit of orientation the phone surface has
 * no room for.
 */
export function UrgentNoticePanel({
  communityId,
  hasPublishedSite,
  initialNotice,
}: UrgentNoticePanelProps) {
  return (
    <div className="space-y-5" data-testid="tool-panel-notice">
      <p className="text-sm text-content-secondary">
        A band across the top of every page on your public website. Use it for closures,
        boil-water orders, storm updates — anything residents need before they read anything
        else.
      </p>
      <UrgentNoticeForm
        communityId={communityId}
        hasPublishedSite={hasPublishedSite}
        initialNotice={initialNotice}
      />
    </div>
  );
}
