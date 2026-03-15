'use client';

import { useEffect, useRef, useState } from 'react';
import { PhoneFrame } from '@propertypro/ui';

type TabKey = 'public' | 'mobile' | 'compliance' | 'admin';

interface TabDef {
  key: TabKey;
  label: string;
  url: string | null;
}

interface TabbedPreviewClientProps {
  publicUrl: string;
  mobileUrl: string | null;
  complianceUrl: string | null;
  adminUrl: string | null;
}

export function TabbedPreviewClient({
  publicUrl,
  mobileUrl,
  complianceUrl,
  adminUrl,
}: TabbedPreviewClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('public');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(() => new Set(['public']));
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const tabs: TabDef[] = [
    { key: 'public', label: 'Public Website', url: publicUrl },
    { key: 'mobile', label: 'Mobile App', url: mobileUrl },
    { key: 'compliance', label: 'Compliance', url: complianceUrl },
    { key: 'admin', label: 'Admin Dashboard', url: adminUrl },
  ];

  const activeTabDef = tabs.find((t) => t.key === activeTab)!;

  const handleTabClick = (key: TabKey) => {
    setActiveTab(key);
    setVisitedTabs((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const handleCopyShareableLink = async () => {
    const url = activeTabDef.url;
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }

    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = setTimeout(() => {
      setCopyState('idle');
    }, 1600);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex">
          {tabs.map((tab) => {
            const isActive = tab.key === activeTab;
            const isDisabled = !tab.url;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabClick(tab.key)}
                disabled={isDisabled}
                className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600'
                    : isDisabled
                      ? 'cursor-not-allowed text-gray-300'
                      : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" />
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            void handleCopyShareableLink();
          }}
          disabled={!activeTabDef.url}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {copyState === 'copied'
            ? 'Copied!'
            : copyState === 'error'
              ? 'Copy failed'
              : 'Copy link'}
        </button>
      </div>

      {/* Tab panels — kept mounted to avoid iframe reloads */}
      <div className="relative flex-1">
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const hasVisited = visitedTabs.has(tab.key);

          // Only render the iframe once the tab has been visited (lazy load)
          if (!hasVisited || !tab.url) {
            if (isActive && !tab.url) {
              return (
                <div
                  key={tab.key}
                  className="absolute inset-0 flex items-center justify-center text-sm text-gray-400"
                >
                  {tab.label} not available
                </div>
              );
            }
            return null;
          }

          if (tab.key === 'mobile') {
            return (
              <div
                key={tab.key}
                className="absolute inset-0 flex items-center justify-center overflow-auto bg-gray-100 p-4"
                style={{ display: isActive ? 'flex' : 'none' }}
              >
                <PhoneFrame src={tab.url} />
              </div>
            );
          }

          return (
            <iframe
              key={tab.key}
              src={tab.url}
              className="absolute inset-0 h-full w-full"
              style={{ display: isActive ? 'block' : 'none' }}
              title={`${tab.label} preview`}
            />
          );
        })}
      </div>
    </div>
  );
}
