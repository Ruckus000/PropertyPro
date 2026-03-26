'use client';

/**
 * Website Tab Panel — sub-tabs for Branding and Page Template editing.
 */
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { CommunityWebsiteEditor } from './CommunityWebsiteEditor';

// CodeMirror requires browser APIs at import time — must skip SSR
const JsxTemplateEditor = dynamic(() => import('./JsxTemplateEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20 text-gray-500">
      Loading editor…
    </div>
  ),
});

interface WebsiteTabPanelProps {
  communityId: number;
  communitySlug: string;
  customDomain: string | null;
}

type SubTab = 'branding' | 'template';

export function WebsiteTabPanel({ communityId, communitySlug, customDomain }: WebsiteTabPanelProps) {
  const [subTab, setSubTab] = useState<SubTab>('branding');

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4">
          <button
            onClick={() => setSubTab('branding')}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              subTab === 'branding'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Branding
          </button>
          <button
            onClick={() => setSubTab('template')}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              subTab === 'template'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Page Template
          </button>
        </nav>
      </div>

      {/* Sub-tab content */}
      {subTab === 'branding' && (
        <CommunityWebsiteEditor
          communityId={communityId}
          communitySlug={communitySlug}
          customDomain={customDomain}
        />
      )}
      {subTab === 'template' && (
        <JsxTemplateEditor communityId={communityId} />
      )}
    </div>
  );
}
