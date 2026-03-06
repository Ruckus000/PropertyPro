'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AgeBadge } from './AgeBadge';
import { TypeBadge } from './TypeBadge';

export type PreviewTab = 'landing' | 'board' | 'mobile';

const TABS: { value: PreviewTab; label: string }[] = [
  { value: 'landing', label: 'Landing Page' },
  { value: 'board', label: 'Board Portal' },
  { value: 'mobile', label: 'Mobile App' },
];

export interface DemoToolbarProps {
  demoId: number;
  prospectName: string;
  templateType: string;
  createdAt: string;
  activeTab?: PreviewTab;
  variant?: 'full' | 'minimal';
  communityId?: number;
}

export function DemoToolbar({
  demoId,
  prospectName,
  templateType,
  createdAt,
  activeTab = 'board',
  variant = 'full',
  communityId,
}: DemoToolbarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (variant === 'minimal') {
    return (
      <div className="flex items-center border-b border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href={`/demo/${demoId}/preview?tab=mobile`}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Back to Preview
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-900">{prospectName}</span>
          <TypeBadge type={templateType} />
          <AgeBadge createdAt={createdAt} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
      {/* Left: back link + prospect info */}
      <div className="flex items-center gap-3">
        <Link href="/demo" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Demos
        </Link>
        <span className="text-gray-300">|</span>
        <span className="text-sm font-semibold text-gray-900">{prospectName}</span>
        <TypeBadge type={templateType} />
        <AgeBadge createdAt={createdAt} />
      </div>

      {/* Center: segmented tab control */}
      <div className="flex items-center rounded-lg bg-gray-100 p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`?tab=${tab.value}`}
            replace
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        <Link
          href={`/demo/${demoId}/edit`}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit
        </Link>
        {communityId && (
          <Link
            href={`/clients/${communityId}/site-builder?demoId=${demoId}`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Site Builder
          </Link>
        )}
        <button
          onClick={handleCopyLink}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        {activeTab === 'mobile' && (
          <Link
            href={`/demo/${demoId}/mobile`}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Full-Screen Mobile
          </Link>
        )}
      </div>
    </div>
  );
}
