'use client';

/**
 * Demo Edit Drawer — overlay panel for editing demo branding and prospect info.
 *
 * PR #9b — the legacy "Page Template" sub-tab (JsxTemplateEditor with a
 * JSX code editor + buildDefaultJsx / buildDefaultMobileJsx helpers)
 * was retired. Demos render via the block-model layout registry now;
 * site content is edited from the PM editor at /pm/settings/website.
 *
 * Remaining tabs: Branding, Info.
 *
 * The `previewTab` prop is preserved for back-compat with call sites
 * even though the template-tab gating it controlled is gone — the
 * branding-and-info tabs are visible regardless of which preview is
 * active.
 */
import { useState, useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import { BrandingEditSection } from './BrandingEditSection';
import { ProspectEditSection } from './ProspectEditSection';
import { useRovingTabs } from '@/components/a11y/use-roving-tabs';

interface DemoEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  demoId: number;
  communityId: number;
  prospectName: string;
  onSaved: () => void;
  /**
   * Which preview tab is active. Kept for back-compat with call sites;
   * no longer affects the drawer's tab list after the Page Template tab
   * was retired in PR #9b.
   */
  previewTab?: 'public' | 'mobile' | 'admin';
}

type DrawerTab = 'branding' | 'info';

const DRAWER_TABS = ['branding', 'info'] as const satisfies readonly DrawerTab[];
const DRAWER_TAB_LABELS: Record<DrawerTab, string> = {
  branding: 'Branding',
  info: 'Info',
};

interface BrandingInfo {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  communityName: string;
}

const DEFAULT_BRANDING: BrandingInfo = {
  // "Florida Modern" coral default — matches packages/theme THEME_DEFAULTS so an
  // unbranded demo community previews with the platform brand, not tech-blue.
  primaryColor: '#C2533A',
  secondaryColor: '#6B7280',
  accentColor: '#F7DCD2',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  communityName: 'Community',
};

const DEFAULT_DRAWER_WIDTH = 640;
const MIN_DRAWER_WIDTH = 480;
const VIEWPORT_GUTTER = 120;

function clampDrawerWidth(width: number, maxWidth: number): number {
  return Math.min(Math.max(width, MIN_DRAWER_WIDTH), Math.max(MIN_DRAWER_WIDTH, maxWidth));
}

function getMaxDrawerWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_DRAWER_WIDTH;
  return Math.max(MIN_DRAWER_WIDTH, window.innerWidth - VIEWPORT_GUTTER);
}


// ---------------------------------------------------------------------------
// Main Drawer
// ---------------------------------------------------------------------------

export function DemoEditDrawer({
  isOpen,
  onClose,
  demoId,
  communityId,
  prospectName,
  onSaved,
  previewTab: _previewTab = 'public',
}: DemoEditDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('branding');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const { tabListProps, getTabProps, getPanelProps } = useRovingTabs(
    DRAWER_TABS,
    activeTab,
    setActiveTab,
    { idPrefix: 'demo-edit-drawer', label: 'Demo settings sections' },
  );

  // Escape closes, and focus returns where it came from.
  //
  // Neither existed: the drawer had no keyboard dismissal, and opening it left
  // focus behind on the page underneath, so a keyboard user had to tab forward
  // through the whole page to reach the form they had just opened.
  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the drawer so the next Tab lands inside it.
    panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Guard against restoring focus to a node that has since been removed —
      // a detached element silently sends focus to <body> instead.
      const previous = restoreFocusRef.current;
      if (previous && previous.isConnected) previous.focus();
    };
  }, [isOpen, onClose]);
  const [branding, setBranding] = useState<BrandingInfo>({ ...DEFAULT_BRANDING, communityName: prospectName });
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const pointerMoveHandlerRef = useRef<((event: PointerEvent) => void) | null>(null);
  const pointerUpHandlerRef = useRef<(() => void) | null>(null);

  // Fetch branding on mount and when refreshed
  const fetchBranding = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/demos/${demoId}/community/branding`);
      if (!res.ok) return;
      const data = await res.json();
      const b = data.branding ?? {};

      // Also fetch community name
      const comRes = await fetch(`/api/admin/demos/${demoId}/community`);
      const comData = comRes.ok ? await comRes.json() : {};
      const community = comData.community ?? {};

      setBranding({
        primaryColor: b.primaryColor ?? DEFAULT_BRANDING.primaryColor,
        secondaryColor: b.secondaryColor ?? DEFAULT_BRANDING.secondaryColor,
        accentColor: b.accentColor ?? DEFAULT_BRANDING.accentColor,
        fontHeading: b.fontHeading ?? DEFAULT_BRANDING.fontHeading,
        fontBody: b.fontBody ?? DEFAULT_BRANDING.fontBody,
        communityName: community.name ?? prospectName,
      });
    } catch {
      // Use defaults on failure
    }
  }, [demoId, prospectName]);

  useEffect(() => {
    if (isOpen) {
      fetchBranding();
    }
  }, [isOpen, fetchBranding]);

  useEffect(() => {
    const handleWindowResize = () => {
      setDrawerWidth((prev) => clampDrawerWidth(prev, getMaxDrawerWidth()));
    };
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, []);

  const finishResize = useCallback(() => {
    dragStateRef.current = null;
    document.body.style.userSelect = '';
  }, []);

  const detachResizeListeners = useCallback(() => {
    if (pointerMoveHandlerRef.current) {
      window.removeEventListener('pointermove', pointerMoveHandlerRef.current);
      pointerMoveHandlerRef.current = null;
    }
    if (pointerUpHandlerRef.current) {
      window.removeEventListener('pointerup', pointerUpHandlerRef.current);
      pointerUpHandlerRef.current = null;
    }
  }, []);

  const handleResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    detachResizeListeners();
    dragStateRef.current = { startX: event.clientX, startWidth: drawerWidth };
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const delta = drag.startX - moveEvent.clientX;
      const nextWidth = drag.startWidth + delta;
      setDrawerWidth(clampDrawerWidth(nextWidth, getMaxDrawerWidth()));
    };

    const handlePointerUp = () => {
      detachResizeListeners();
      finishResize();
    };

    pointerMoveHandlerRef.current = handlePointerMove;
    pointerUpHandlerRef.current = handlePointerUp;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [detachResizeListeners, drawerWidth, finishResize]);

  useEffect(() => {
    return () => {
      detachResizeListeners();
      finishResize();
    };
  }, [detachResizeListeners, finishResize]);

  // When branding is saved, refetch to update the context panel
  const handleBrandingSaved = useCallback(() => {
    fetchBranding();
    onSaved();
  }, [fetchBranding, onSaved]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer panel — wider to accommodate code editor.
          `inert` when closed. The panel stays MOUNTED so the slide-out
          transition can run, and without this its whole form — inputs, the
          code editor, the save button — remained in the tab order off-screen:
          a keyboard user tabbing through the demo list fell into a form they
          could not see. `inert` removes the subtree from focus and from the
          accessibility tree without unmounting it. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-demo-title"
        inert={!isOpen}
        className={`fixed right-0 top-0 z-50 flex h-full max-w-full flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: drawerWidth }}
      >
        <div
          role="separator"
          aria-label="Resize edit demo drawer"
          aria-orientation="vertical"
          data-testid="drawer-resize-handle"
          onPointerDown={handleResizePointerDown}
          onDoubleClick={() => setDrawerWidth(DEFAULT_DRAWER_WIDTH)}
          className="absolute left-0 top-0 h-full w-2 -translate-x-1 cursor-col-resize"
        >
          <div className="ml-auto h-full w-px bg-transparent transition-colors hover:bg-coral-300" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 id="edit-demo-title" className="text-sm font-semibold text-gray-900">Edit Demo</h2>
            <p className="text-xs text-gray-500">{prospectName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close edit demo drawer"
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Tab navigation. Was a <nav> wrapping plain buttons — the wrong
            element (this selects panels, it does not navigate) and no tab
            semantics at all. */}
        <div className="border-b border-gray-200 px-5">
          <div className="-mb-px flex gap-4" {...tabListProps}>
            {DRAWER_TABS.map((tab) => (
              <button
                key={tab}
                {...getTabProps(tab)}
                className={`pb-2 pt-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-coral-600 text-coral-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {DRAWER_TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4" {...getPanelProps(activeTab)}>
          {activeTab === 'branding' && (
            <BrandingEditSection
              demoId={demoId}
              communityId={communityId}
              onSaved={handleBrandingSaved}
            />
          )}
          {activeTab === 'info' && (
            <ProspectEditSection
              demoId={demoId}
              onSaved={onSaved}
            />
          )}
        </div>
      </div>
    </>
  );
}
