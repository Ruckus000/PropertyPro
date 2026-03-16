'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, X, ExternalLink } from 'lucide-react';
import { PhoneFrame } from '@propertypro/ui';
import { DemoEditDrawer } from '@/components/demo/DemoEditDrawer';

type TabKey = 'public' | 'mobile' | 'admin';

interface TabDef {
  key: TabKey;
  label: string;
  url: string | null;
}

interface TabbedPreviewClientProps {
  publicUrl: string;
  mobileUrl: string | null;
  adminUrl: string | null;
  demoId: number;
  communityId: number;
  prospectName: string;
}

export function TabbedPreviewClient({
  publicUrl,
  mobileUrl,
  adminUrl,
  demoId,
  communityId,
  prospectName,
}: TabbedPreviewClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('public');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshFlash, setRefreshFlash] = useState(false);

  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRefs = useRef<Record<TabKey, HTMLIFrameElement | null>>({
    public: null,
    mobile: null,
    admin: null,
  });

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
    { key: 'admin', label: 'Admin Dashboard', url: adminUrl },
  ];

  const activeTabDef = tabs.find((t) => t.key === activeTab)!;

  const handleTabClick = (key: TabKey) => {
    setActiveTab(key);
    // Close the edit drawer when switching away from Public Website
    if (key !== 'public') setDrawerOpen(false);
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

  // Refresh all mounted iframes after an edit is saved.
  // Authenticated iframes are staggered to avoid rate-limiting on demo-login.
  const handleSaved = useCallback(() => {
    const reloadIframe = (key: TabKey) => {
      const iframe = iframeRefs.current[key];
      if (!iframe) return;
      try {
        // eslint-disable-next-line no-self-assign
        iframe.src = iframe.src;
      } catch {
        // Cross-origin iframe — can't reload, ignore
      }
    };

    // Public tab has no auth — reload immediately
    reloadIframe('public');
    // Stagger authenticated tabs to avoid rate-limit on demo-login
    setTimeout(() => reloadIframe('mobile'), 300);
    setTimeout(() => reloadIframe('admin'), 1200);

    // Brief green border flash as visual confirmation
    setRefreshFlash(true);
    setTimeout(() => setRefreshFlash(false), 600);
  }, []);

  // Ref callback for iframes
  const setIframeRef = useCallback((key: TabKey, el: HTMLIFrameElement | null) => {
    iframeRefs.current[key] = el;
  }, []);

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
      <div className={`relative flex-1 transition-all duration-200 ${refreshFlash ? 'ring-2 ring-green-400 ring-inset' : ''}`}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;

          if (!tab.url) {
            if (isActive) {
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
                <div className="flex flex-col items-center gap-4">
                  <PhoneFrame ref={(el) => setIframeRef('mobile', el)} src={tab.url} />
                  <a
                    href={tab.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    <ExternalLink size={12} />
                    Open in new tab
                  </a>
                </div>
              </div>
            );
          }

          return (
            <iframe
              key={tab.key}
              ref={(el) => setIframeRef(tab.key, el)}
              src={tab.url}
              className="absolute inset-0 h-full w-full"
              style={{ display: isActive ? 'block' : 'none' }}
              title={`${tab.label} preview`}
            />
          );
        })}

        {/* Floating Edit Button — hidden on Admin Dashboard tab */}
        {activeTab !== 'admin' && (
          <button
            type="button"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className={`absolute bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-blue-700 hover:shadow-xl ${
              drawerOpen ? 'rotate-0' : ''
            }`}
            title={drawerOpen ? 'Close editor' : 'Edit demo'}
          >
            {drawerOpen ? <X size={20} /> : <Pencil size={20} />}
          </button>
        )}
      </div>

      {/* Edit Drawer */}
      <DemoEditDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        demoId={demoId}
        communityId={communityId}
        prospectName={prospectName}
        onSaved={handleSaved}
        previewTab={activeTab}
      />
    </div>
  );
}
