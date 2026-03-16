'use client';

/**
 * Demo Edit Drawer — overlay panel for editing demo branding and page template.
 *
 * Slides in from the right over the preview iframes. Contains tabs for:
 * - Page Template: JSX code editor with live branding context panel
 * - Branding: color pickers, fonts, logo (controls CSS variables)
 *
 * The branding context panel above the code editor always shows current
 * branding values, updating automatically when branding is changed.
 */
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, Loader2 } from 'lucide-react';
import { BrandingEditSection } from './BrandingEditSection';

// CodeMirror requires browser APIs at import time — must skip SSR
const JsxTemplateEditor = dynamic(() => import('../clients/JsxTemplateEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
      <span className="text-sm text-gray-500">Loading editor...</span>
    </div>
  ),
});

interface DemoEditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  demoId: number;
  communityId: number;
  prospectName: string;
  onSaved: () => void;
  /** Which preview tab is active — controls whether Page Template tab is shown */
  previewTab?: 'public' | 'mobile' | 'admin';
}

type DrawerTab = 'branding' | 'template';

interface BrandingInfo {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  communityName: string;
}

const DEFAULT_BRANDING: BrandingInfo = {
  primaryColor: '#2563EB',
  secondaryColor: '#6B7280',
  accentColor: '#DBEAFE',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  communityName: 'Community',
};

// ---------------------------------------------------------------------------
// Build default JSX with actual branding values baked in
// ---------------------------------------------------------------------------

function buildDefaultJsx(b: BrandingInfo): string {
  return `/**
 * ============================================================
 * ${b.communityName.toUpperCase()} — WEBSITE TEMPLATE
 * ============================================================
 *
 * BRANDING CONTEXT (for AI assistants):
 * Community: ${b.communityName}
 * This is the public-facing website for a Florida community
 * association managed by PropertyPro.
 *
 * CURRENT BRANDING:
 *   Primary color  : ${b.primaryColor}
 *   Secondary color: ${b.secondaryColor}
 *   Accent color   : ${b.accentColor}
 *   Heading font   : ${b.fontHeading}
 *   Body font      : ${b.fontBody}
 *
 * CSS VARIABLES (use these in Tailwind arbitrary values):
 *   --pp-primary    → bg-[var(--pp-primary)]
 *   --pp-secondary  → text-[var(--pp-secondary)]
 *   --pp-accent     → bg-[var(--pp-accent)]
 *
 * STYLING:
 *   Tailwind CSS is available. React 18 sandbox.
 *   Define a function App() that returns JSX.
 *
 * LINKS:
 *   /auth/login — Resident login portal
 *
 * ============================================================
 */

function App() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-[var(--pp-primary)] text-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">${b.communityName}</h1>
          <a href="/auth/login" className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors">
            Resident Login
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--pp-primary)] to-[var(--pp-accent)] text-white py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Welcome to ${b.communityName}</h2>
          <p className="text-xl opacity-90 mb-8">Your digital hub for community information and resources.</p>
          <a href="/auth/login" className="inline-block bg-white text-[var(--pp-primary)] font-semibold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors">
            Access Portal
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-[var(--pp-primary)]/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📄</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Documents</h3>
            <p className="text-gray-600">Access governing documents, budgets, and meeting minutes.</p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-[var(--pp-primary)]/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📅</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Meetings</h3>
            <p className="text-gray-600">View upcoming meetings and access past meeting records.</p>
          </div>
          <div className="text-center p-6">
            <div className="w-12 h-12 bg-[var(--pp-primary)]/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📢</span>
            </div>
            <h3 className="text-lg font-semibold mb-2">Announcements</h3>
            <p className="text-gray-600">Stay informed with community news and updates.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8 px-6">
        <div className="max-w-6xl mx-auto text-center">
          <p>&copy; {new Date().getFullYear()} ${b.communityName}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}`;
}

// ---------------------------------------------------------------------------
// Build branding context string for "Copy for Claude" button
// ---------------------------------------------------------------------------

function buildBrandingContext(b: BrandingInfo): string {
  return `/*
 * BRANDING CONTEXT
 * Community: ${b.communityName}
 * Primary: ${b.primaryColor} | Secondary: ${b.secondaryColor} | Accent: ${b.accentColor}
 * Heading font: ${b.fontHeading} | Body font: ${b.fontBody}
 * CSS vars: --pp-primary, --pp-secondary, --pp-accent
 * Use with Tailwind: bg-[var(--pp-primary)], text-[var(--pp-accent)]
 */`;
}

// ---------------------------------------------------------------------------
// Build default mobile JSX — compact single-column layout for phone screens
// ---------------------------------------------------------------------------

function buildDefaultMobileJsx(b: BrandingInfo): string {
  return `/**
 * ============================================================
 * ${b.communityName.toUpperCase()} — MOBILE APP TEMPLATE
 * ============================================================
 *
 * BRANDING CONTEXT (for AI assistants):
 * Community: ${b.communityName}
 * This is the mobile app view for a Florida community
 * association managed by PropertyPro.
 *
 * CURRENT BRANDING:
 *   Primary color  : ${b.primaryColor}
 *   Secondary color: ${b.secondaryColor}
 *   Accent color   : ${b.accentColor}
 *   Heading font   : ${b.fontHeading}
 *   Body font      : ${b.fontBody}
 *
 * CSS VARIABLES:
 *   --pp-primary, --pp-secondary, --pp-accent
 *
 * DESIGN NOTES:
 *   Single-column mobile layout. No hero section.
 *   Compact cards, large tap targets, minimal chrome.
 *
 * ============================================================
 */

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar */}
      <header className="bg-[var(--pp-primary)] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold truncate">${b.communityName}</h1>
        <a href="/auth/login" className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-md transition-colors">
          Login
        </a>
      </header>

      {/* Announcements */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Announcements</h2>
        <div className="space-y-2">
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <p className="text-sm font-medium text-gray-900">Annual Meeting Scheduled</p>
            <p className="text-xs text-gray-500 mt-1">March 15, 2026</p>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <p className="text-sm font-medium text-gray-900">Pool Maintenance Notice</p>
            <p className="text-xs text-gray-500 mt-1">March 10, 2026</p>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
            <p className="text-sm font-medium text-gray-900">Budget Update Available</p>
            <p className="text-xs text-gray-500 mt-1">March 5, 2026</p>
          </div>
        </div>
      </section>

      {/* Upcoming Meetings */}
      <section className="px-4 pt-2 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Upcoming Meetings</h2>
        <div className="space-y-2">
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Board Meeting</p>
              <p className="text-xs text-gray-500">Mar 20 at 7:00 PM</p>
            </div>
            <span className="text-xs bg-[var(--pp-accent)] text-[var(--pp-primary)] px-2 py-0.5 rounded-full font-medium">Board</span>
          </div>
          <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Annual Owner Meeting</p>
              <p className="text-xs text-gray-500">Apr 5 at 6:00 PM</p>
            </div>
            <span className="text-xs bg-[var(--pp-accent)] text-[var(--pp-primary)] px-2 py-0.5 rounded-full font-medium">Owner</span>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="px-4 pt-2 pb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Quick Links</h2>
        <div className="grid grid-cols-2 gap-2">
          <a href="/documents" className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 text-center hover:bg-gray-50 transition-colors">
            <span className="text-2xl block mb-1">📄</span>
            <span className="text-sm font-medium text-gray-900">Documents</span>
          </a>
          <a href="/maintenance" className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 text-center hover:bg-gray-50 transition-colors">
            <span className="text-2xl block mb-1">🔧</span>
            <span className="text-sm font-medium text-gray-900">Maintenance</span>
          </a>
          <a href="/meetings" className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 text-center hover:bg-gray-50 transition-colors">
            <span className="text-2xl block mb-1">📅</span>
            <span className="text-sm font-medium text-gray-900">Meetings</span>
          </a>
          <a href="/contact" className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 text-center hover:bg-gray-50 transition-colors">
            <span className="text-2xl block mb-1">📞</span>
            <span className="text-sm font-medium text-gray-900">Contact</span>
          </a>
        </div>
      </section>
    </div>
  );
}`;
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
  previewTab = 'public',
}: DemoEditDrawerProps) {
  const showTemplateTab = previewTab !== 'admin';
  const templateVariant = previewTab === 'mobile' ? 'mobile' : 'public';
  const [activeTab, setActiveTab] = useState<DrawerTab>(showTemplateTab ? 'template' : 'branding');
  const [branding, setBranding] = useState<BrandingInfo>({ ...DEFAULT_BRANDING, communityName: prospectName });
  // Switch to branding tab when Page Template tab is hidden (admin tab only)
  useEffect(() => {
    if (previewTab === 'admin' && activeTab === 'template') {
      setActiveTab('branding');
    }
  }, [previewTab, activeTab]);

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
        />
      )}

      {/* Drawer panel — wider to accommodate code editor */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-[640px] max-w-full flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Edit Demo</h2>
            <p className="text-xs text-gray-500">{prospectName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="border-b border-gray-200 px-5">
          <nav className="-mb-px flex gap-4">
            {showTemplateTab && (
              <button
                type="button"
                onClick={() => setActiveTab('template')}
                className={`pb-2 pt-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'template'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Page Template
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('branding')}
              className={`pb-2 pt-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'branding'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Branding
            </button>
          </nav>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'template' && (
            <JsxTemplateEditor
              key={templateVariant}
              communityId={communityId}
              onSaved={onSaved}
              defaultJsx={templateVariant === 'mobile' ? buildDefaultMobileJsx(branding) : buildDefaultJsx(branding)}
              brandingContext={buildBrandingContext(branding)}
              variant={templateVariant}
              brandingColors={{ primary: branding.primaryColor, secondary: branding.secondaryColor, accent: branding.accentColor }}
            />
          )}
          {activeTab === 'branding' && (
            <BrandingEditSection
              demoId={demoId}
              communityId={communityId}
              onSaved={handleBrandingSaved}
            />
          )}
        </div>
      </div>
    </>
  );
}
