import { TriangleAlert } from 'lucide-react';
import { isUrgentNoticeActive, type UrgentNoticeLike } from '@/lib/site-editor/urgent-notice';

export interface UrgentNoticeBannerProps {
  /** The community row fields — pass `getCommunityPublicInfo`'s result directly. */
  notice: UrgentNoticeLike;
}

/**
 * The urgent notice band, rendered above the header on every public page.
 *
 * ## Two things here are load-bearing
 *
 * **The text is a React text child.** `{notice.urgentNoticeText}` — never
 * `dangerouslySetInnerHTML`, never a markdown renderer, never link
 * autodetection. React escapes text children on output, and that is the ONLY
 * thing standing between a manager's typo (or a compromised manager account)
 * and stored XSS on a public page that bypasses every review step in the
 * product. `__tests__/app/public-site/urgent-notice-render.test.tsx` asserts a
 * `<script>` payload renders as visible text; if a future change to this file
 * breaks that, the test is the alarm.
 *
 * **Expiry is evaluated here, at render time.** Not by a cron, not at write
 * time. A sweep that fails, is misconfigured, or is deleted would otherwise
 * leave a stale emergency banner in front of residents indefinitely. Because
 * the check runs on every request, the worst a broken sweep can do is leave a
 * row in the database that nobody ever sees.
 *
 * Returns null when there is no active notice, so callers can render it
 * unconditionally.
 */
export function UrgentNoticeBanner({ notice }: UrgentNoticeBannerProps) {
  if (!isUrgentNoticeActive(notice, new Date())) return null;

  return (
    <div
      role="alert"
      data-testid="urgent-notice-banner"
      // NOT sticky itself. On the public site it shares a sticky container with
      // the preview banner (see public-site/page.tsx) — two independent
      // `sticky top-0` siblings would occupy the same offset and the later one
      // would paint over this one as soon as the page scrolled.
      className="flex items-start justify-center gap-2 border-b border-status-danger-border bg-status-danger-bg px-4 py-3 text-center text-base font-medium text-status-danger"
    >
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      {/* Text child. See the note above before changing this line. */}
      <span>{notice.urgentNoticeText}</span>
    </div>
  );
}
