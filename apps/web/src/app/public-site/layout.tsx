import type { ReactNode } from 'react';
import { SITE_FONT_CLASS } from '@/lib/public-site/site-font';

/**
 * Public site layout — minimal wrapper for the community public site.
 *
 * The root layout already renders <html> and <body>, so this layout
 * provides only a wrapper div with no sidebar, nav chrome, or auth context.
 */
export default function PublicSiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`site-frame min-h-screen flex flex-col ${SITE_FONT_CLASS}`}>
      {children}
    </div>
  );
}
