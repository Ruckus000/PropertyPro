'use client';

import { useEffect, useState } from 'react';
import { PhoneFrame } from '@propertypro/ui';
import type { PreviewTab } from './DemoToolbar';

export interface TabbedPreviewClientProps {
  activeTab: PreviewTab;
  landingUrl: string;
  boardUrl: string | null;
  residentUrl: string | null;
}

export function TabbedPreviewClient({
  activeTab,
  landingUrl,
  boardUrl,
  residentUrl,
}: TabbedPreviewClientProps) {
  const [mounted, setMounted] = useState<Set<PreviewTab>>(() => new Set([activeTab]));

  useEffect(() => {
    setMounted((prev) => {
      if (prev.has(activeTab)) return prev;
      return new Set([...prev, activeTab]);
    });
  }, [activeTab]);

  return (
    <div className="relative flex-1">
      {/* Landing page pane */}
      {mounted.has('landing') && (
        <div className={`absolute inset-0 ${activeTab === 'landing' ? '' : 'hidden'}`}>
          <iframe
            src={landingUrl}
            className="h-full w-full"
            title="Property landing page preview"
          />
        </div>
      )}

      {/* Board portal pane */}
      {mounted.has('board') && (
        <div className={`absolute inset-0 ${activeTab === 'board' ? '' : 'hidden'}`}>
          {boardUrl ? (
            <iframe
              src={boardUrl}
              className="h-full w-full"
              title="Board member dashboard preview"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Board user not available
            </div>
          )}
        </div>
      )}

      {/* Mobile app pane */}
      {mounted.has('mobile') && (
        <div
          className={`absolute inset-0 flex items-center justify-center overflow-auto bg-gray-100 ${
            activeTab === 'mobile' ? '' : 'hidden'
          }`}
        >
          {residentUrl ? (
            <PhoneFrame src={residentUrl} />
          ) : (
            <div className="text-sm text-gray-400">Resident user not available</div>
          )}
        </div>
      )}
    </div>
  );
}
