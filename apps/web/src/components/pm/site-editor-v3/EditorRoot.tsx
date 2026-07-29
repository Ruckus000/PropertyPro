'use client';

import { useCallback, useState } from 'react';
import { useContentBlocks } from '@/hooks/use-content-blocks';
import type { CanvasContext } from '@/lib/site-editor/load-canvas-context';
import dynamic from 'next/dynamic';
import { EditorShell } from './EditorShell';
import { StatusLine } from './StatusLine';

// Code-split, and mounted only once opened.
//
// The preview pulls the whole read-only render path — every block view, the
// dialog chrome, the loading/error/empty surfaces — and a PM who never presses
// Preview should not pay for it. The editor route sits at ~697 KiB against a
// 700 KiB HARD budget with this imported statically; deferring it is the
// difference between passing and blocking every later phase.
const PreviewDialog = dynamic(
  () => import('./PreviewDialog').then((m) => m.PreviewDialog),
  { loading: () => null },
);

// Same reasoning as the preview: opened on demand, so it has no business in the
// initial payload of a route sitting inside 50 KiB of a hard budget.
const PublishSheet = dynamic(
  () => import('./publish/PublishSheet').then((m) => m.PublishSheet),
  { loading: () => null },
);

// Phase 7. Deferred for the same budget reason, and it works because the panel
// body is only rendered when its tab is active — so the chunk (form + the Radix
// alert-dialog stack behind the remove confirmation) is requested on the click,
// not on mount. A PM who never posts a notice never pays for it.
const UrgentNoticePanel = dynamic(
  () => import('./panels/UrgentNoticePanel').then((m) => m.UrgentNoticePanel),
  { loading: () => null },
);

// Phase 8. Same reasoning as the notice panel: `renderToolPanel` only renders
// the ACTIVE tool, so this chunk (the form, the switches, the favicon upload
// path) is requested on the tab click rather than on mount. A PM who never
// opens Site pays nothing for it — which is the whole reason this route is
// still inside its 700 KiB budget.
const SitePanel = dynamic(
  () => import('./panels/SitePanel').then((m) => m.SitePanel),
  { loading: () => null },
);

// Same reasoning again: only the active tool's panel is rendered, so the Add
// catalog — and, behind its own nested dynamic import, the image upload flow —
// is fetched on the tab click. A PM editing existing sections never pays for it.
const AddPanel = dynamic(() => import('./panels/AddPanel').then((m) => m.AddPanel), {
  loading: () => null,
});

// The two Pro tools, split for the same budget reason as everything above — and
// with more force, since they are the two panels the median PM opens least. The
// domain panel in particular pulls its own query stack and DNS table.
const StylingPanel = dynamic(
  () => import('./panels/StylingPanel').then((m) => m.StylingPanel),
  { loading: () => null },
);
const DomainPanel = dynamic(
  () => import('./panels/DomainPanel').then((m) => m.DomainPanel),
  { loading: () => null },
);
// Code-split, for the same reason as PreviewDialog/PublishSheet above: the
// inspector renders nothing until a section is selected, but a static import
// put its whole subtree — the form registry, and every form's shared field
// chrome — in the initial payload of every PM's editor.
const Inspector = dynamic(() => import('./Inspector').then((m) => m.Inspector), {
  // No `loading`: the inspector's own resting state IS nothing, so a skeleton
  // would appear where a blank column belongs.
  loading: () => null,
});

import { WizardEntryBanner } from '@/components/pm/onboarding-wizard/WizardEntryBanner';
import { Canvas } from './canvas/Canvas';
import { SiteEditorProvider, useSiteEditor } from './editor-context';
import { SectionList } from './panels/SectionList';
import type { EditorToolId, ProToolAccess } from './tools';
import type { CustomCssOverrides } from '@propertypro/shared';
import { THEME_DEFAULTS } from '@propertypro/theme';
import type { UrgentNotice } from '@/hooks/use-urgent-notice';
import type { SiteSettingsRecord } from '@/hooks/use-site-settings';
import type { SitePanelProps } from './panels/SitePanel';
import type { StylingPanelTheme } from './panels/StylingPanel';
import { AutosaveStatusProvider, useAutosaveStatus } from './inspector/autosave-status';
import { useSiteDiff } from './use-site-diff';

/** Bridges the active inspector form's save state into the top bar. */
function AutosaveStatusLine() {
  const { status, lastSavedAt, error, onRetry } = useAutosaveStatus();
  return (
    <StatusLine
      status={status}
      lastSavedAt={lastSavedAt}
      error={error}
      onRetry={onRetry}
    />
  );
}

export interface EditorRootProps {
  communityId: number;
  communityName: string;
  publicSiteUrl: string | null;
  proToolAccess: ProToolAccess;
  /**
   * `hasSitePolishBlocks` — whether the plan includes the FAQ / Gallery /
   * Amenities blocks the Add panel offers.
   *
   * Deliberately NOT folded into `proToolAccess`. That map is keyed by
   * `TOOL_PLAN_FEATURE`, and `ToolTabs` renders any tool present in it as
   * Pro-locked — so adding `add` there would lock the Add TAB, which is false:
   * seven of the ten types it offers are available on Essentials. This gates
   * three rows inside the panel, not the panel.
   */
  hasPolishBlocks: boolean;
  /** Null when the community row could not be read; the canvas degrades. */
  canvasContext: CanvasContext | null;
  /**
   * Phase 7 urgent notice. Both values come from the page's existing
   * `getCommunityPublicInfo` read, so they cost no extra query — and passing
   * them down means the notice panel and the phone gate open with real state
   * instead of a spinner, which matters for the one tool in this editor that
   * gets used under time pressure.
   */
  hasPublishedSite: boolean;
  initialNotice: UrgentNotice | null;
  /**
   * Phase 8 site settings. Like the notice above, both come from reads the page
   * already makes, so the Site panel opens with real values rather than a
   * spinner and costs no extra query.
   */
  siteIdentity: SitePanelProps['community'];
  tagline: string | null;
  initialSiteSettings: SiteSettingsRecord | undefined;
  /**
   * Stored Pro+ colour/font overrides, from the same `branding` read that
   * feeds the Site panel. The Colours panel needs no query of its own.
   *
   * There is no matching prop for the Address panel: its state lives at
   * Vercel, and server-seeding it would put a provider round-trip on every
   * editor load for a tab most PMs never open. It fetches on mount instead.
   */
  initialCustomCss: CustomCssOverrides | null;
  /**
   * True when `communities.site_onboarding_completed_at` is null — the wizard
   * was never finished. Surfaces the wizard prompt the legacy editor carried;
   * it is the one entry point that lives *inside* the editor, which is where a
   * PM is when they notice their site looks generic.
   */
  showWizardBanner: boolean;
}

/**
 * What the site renders today — the Colours panel seeds its pickers from this
 * so turning an override on starts from the live colour rather than a constant.
 *
 * Falls back to the platform defaults only when the community row could not be
 * read at all, which is the same condition that degrades the canvas.
 */
function resolveStylingTheme(canvasContext: CanvasContext | null): StylingPanelTheme {
  return {
    primaryColor: canvasContext?.theme.primaryColor ?? THEME_DEFAULTS.primaryColor,
    secondaryColor: canvasContext?.theme.secondaryColor ?? THEME_DEFAULTS.secondaryColor,
    accentColor: canvasContext?.theme.accentColor ?? THEME_DEFAULTS.accentColor,
    bodyFont: canvasContext?.theme.bodyFont ?? THEME_DEFAULTS.fontBody,
  };
}

/**
 * Client root of the v3 editor — the seam where state lives.
 *
 * Phase 2b-2 mounts `SiteEditorProvider` here rather than inside the canvas,
 * because selection and reordering are driven from two different columns: the
 * canvas and the Sections tool panel. Both read the same block list; the query
 * key is shared with `Canvas`'s own `useContentBlocks` call, so this adds no
 * second request.
 *
 * Phase 3 adds the status line, and Phase 4 hangs the change model off here.
 */
export function EditorRoot({
  communityId,
  communityName,
  publicSiteUrl,
  proToolAccess,
  hasPolishBlocks,
  canvasContext,
  hasPublishedSite,
  initialNotice,
  siteIdentity,
  tagline,
  initialSiteSettings,
  initialCustomCss,
  showWizardBanner,
}: EditorRootProps) {
  const { data: blocks } = useContentBlocks(communityId);
  // Shares the blocks query key, so this adds no request — and the publish
  // sheet calls the same hook, so the button's state and the sheet's "N changes
  // ready to publish" can never disagree.
  const { diff, isError: diffFailed } = useSiteDiff(communityId);
  const [activeTool, setActiveTool] = useState<EditorToolId>('sections');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  // Selecting a section on the canvas pulls the Sections panel forward, so the
  // controls for what you just clicked are visible without a second action.
  const handleSelect = useCallback(() => setActiveTool('sections'), []);
  const handlePreview = useCallback(() => setPreviewOpen(true), []);
  const handlePublish = useCallback(() => setPublishOpen(true), []);
  // "Fix this" hands back a block_order slot. Surfacing the Sections panel is
  // this component's job; selecting the row needs the editor context, so it
  // happens one level down in PublishSheetMount.
  const handleSelectSlot = useCallback(() => setActiveTool('sections'), []);
  // The empty states in the Sections panel and on the canvas both name adding a
  // section; this is what makes them able to do it. Passed as a prop rather
  // than read from context because `setActiveTool` lives HERE — the provider's
  // parent — and only `useSiteEditor` is out of reach from this component.
  const handleGoToAdd = useCallback(() => setActiveTool('add'), []);

  return (
    <SiteEditorProvider
      communityId={communityId}
      blocks={blocks ?? []}
      onSelect={handleSelect}
    >
      <AutosaveStatusProvider>
      <EditorShell
        communityName={communityName}
        publicSiteUrl={publicSiteUrl}
        proToolAccess={proToolAccess}
        communityId={communityId}
        hasPublishedSite={hasPublishedSite}
        initialNotice={initialNotice}
        activeTool={activeTool}
        onActiveToolChange={setActiveTool}
        onPreview={handlePreview}
        onPublish={handlePublish}
        // Openable when there is something to publish — and also when the diff
        // failed to load, because the sheet is the only surface that explains
        // that failure and offers a retry.
        canOpenPublish={diff.changes.length > 0 || diffFailed}
        // Driven by whichever inspector form is open. StatusLine renders
        // nothing while idle with no prior save, so this stays invisible until
        // the PM actually edits something.
        status={<AutosaveStatusLine />}
        banner={showWizardBanner ? <WizardEntryBanner communityId={communityId} /> : null}
        renderToolPanel={(tool) => {
          if (tool === 'sections') return <SectionList onAddSection={handleGoToAdd} />;
          if (tool === 'add') {
            return <AddPanel communityId={communityId} hasPolishBlocks={hasPolishBlocks} />;
          }
          if (tool === 'site') {
            return (
              <SitePanel
                communityId={communityId}
                community={siteIdentity}
                tagline={tagline}
                initialSettings={initialSiteSettings}
              />
            );
          }
          if (tool === 'notice') {
            return (
              <UrgentNoticePanel
                communityId={communityId}
                hasPublishedSite={hasPublishedSite}
                initialNotice={initialNotice}
              />
            );
          }
          if (tool === 'styling') {
            return (
              <StylingPanel
                communityId={communityId}
                hasSiteCustomCss={proToolAccess.styling}
                initial={initialCustomCss}
                theme={resolveStylingTheme(canvasContext)}
              />
            );
          }
          if (tool === 'domain') {
            return (
              <DomainPanel
                communityId={communityId}
                hasSiteCustomDomain={proToolAccess.domain}
              />
            );
          }
          return <ToolPanelPlaceholder tool={tool} />;
        }}
        // Returns null when nothing is selected, so passing it unconditionally
        // costs an empty render rather than a branch here.
        inspector={<Inspector communityId={communityId} />}
      >
        {canvasContext ? (
          <Canvas
            communityId={communityId}
            context={canvasContext}
            onAddSection={handleGoToAdd}
          />
        ) : (
          <div className="mx-auto max-w-[1000px] px-5 py-4">
            <div className="rounded-[var(--radius-md)] border border-dashed border-edge-strong bg-surface-card p-10 text-center">
              <p className="text-sm text-content-secondary">
                We couldn&apos;t load this community&apos;s site settings.
              </p>
            </div>
          </div>
        )}
      </EditorShell>

      {previewOpen && canvasContext ? (
        <PreviewDialog
          open
          onOpenChange={setPreviewOpen}
          communityId={communityId}
          context={canvasContext}
        />
      ) : null}

      {publishOpen ? (
        <PublishSheetMount
          communityId={communityId}
          theme={canvasContext?.theme ?? null}
          onOpenChange={setPublishOpen}
          onFixIssue={handleSelectSlot}
        />
      ) : null}
      </AutosaveStatusProvider>
    </SiteEditorProvider>
  );
}

/**
 * Renders the publish sheet inside the editor context, so "Fix this" can
 * actually select the offending section.
 *
 * A separate component because `EditorRoot` is the provider's PARENT and cannot
 * call `useSiteEditor` itself.
 */
function PublishSheetMount({
  communityId,
  theme,
  onOpenChange,
  onFixIssue,
}: {
  communityId: number;
  theme: CanvasContext['theme'] | null;
  onOpenChange: (open: boolean) => void;
  onFixIssue: (slot: number) => void;
}) {
  const { movableSections, select } = useSiteEditor();

  const handleFixIssue = useCallback(
    (slot: number) => {
      onFixIssue(slot);
      // `Issue.slot` is a block_order, not an index — resolve it against the
      // current list rather than treating it as a position.
      const target = movableSections.find((b) => b.blockOrder === slot);
      if (target) select(target.id);
    },
    [movableSections, onFixIssue, select],
  );

  return (
    <PublishSheet
      open
      onOpenChange={onOpenChange}
      communityId={communityId}
      // The canvas context already carries the RESOLVED theme (resolveTheme
      // ran server-side in loadCanvasContext), so the contrast advisories get
      // real colours without pulling packages/theme into this bundle. Without
      // this the gate silently reports nothing at all.
      {...(theme
        ? {
            brandColors: {
              primaryColor: theme.primaryColor,
              accentColor: theme.accentColor,
            },
          }
        : {})}
      onFixIssue={handleFixIssue}
    />
  );
}

function ToolPanelPlaceholder({ tool }: { tool: EditorToolId }) {
  return (
    <p className="text-sm text-content-secondary" data-testid={`tool-panel-${tool}`}>
      This panel is not built yet.
    </p>
  );
}
