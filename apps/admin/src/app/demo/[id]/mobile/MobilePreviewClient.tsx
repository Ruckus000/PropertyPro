'use client';

import Link from 'next/link';
import { PhoneFrame } from '@propertypro/ui';

interface MobilePreviewClientProps {
  src: string;
  splitPreviewHref: string;
}

export function MobilePreviewClient({ src, splitPreviewHref }: MobilePreviewClientProps) {
  return (
    // Skip-link target: this page does not render AdminLayout, which
    // normally owns #main-content.
    <div id="main-content" className="flex h-screen flex-col bg-surface-inverse">
      <div className="flex items-center justify-between border-b border-edge bg-surface-card px-4 py-2">
        <Link href={splitPreviewHref} className="text-sm text-content-tertiary hover:text-content-secondary">
          ← Back to Split Preview
        </Link>
        <Link
          href={splitPreviewHref}
          className="rounded-md border border-edge-strong px-3 py-1.5 text-xs font-medium text-content-secondary hover:bg-surface-page"
        >
          Switch to split-screen
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <PhoneFrame src={src} />
      </div>
    </div>
  );
}
