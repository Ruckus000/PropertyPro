import type { ReactNode } from 'react';

/**
 * Public site layout — minimal wrapper for the community public site.
 *
 * The root layout already renders <html> and <body>, so this layout
 * provides only a wrapper div with no sidebar, nav chrome, or auth context.
 */
export default function PublicSiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      {children}
    </div>
  );
}
