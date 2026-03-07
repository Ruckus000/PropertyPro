'use client';

import Link from 'next/link';
import { PhoneFrame } from '@propertypro/ui';

interface MobilePreviewClientProps {
  src: string;
  splitPreviewHref: string;
}

export function MobilePreviewClient({ src, splitPreviewHref }: MobilePreviewClientProps) {
  return (
    <div className="flex h-screen flex-col bg-gray-950">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <Link href={splitPreviewHref} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Split Preview
        </Link>
        <Link
          href={splitPreviewHref}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
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
