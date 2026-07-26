'use client';

/**
 * EditorFrame — the outermost chrome of the v3 website editor.
 *
 * Layout decision B with the amendment from gap analysis §9 row 2: no app
 * shell, but the real `AppSidebar` is reused in its collapsed 72px state so
 * navigation is not lost. It is deliberately not expandable here — expanding
 * to 260px would take a quarter of the canvas, and v3's own hover-expanding
 * rail was discarded rather than forked (§9 row 2).
 *
 * `AppSidebar` reads `useSidebar()`, so the provider has to be present even
 * though nothing in this frame toggles it.
 *
 * Phase 0 renders the frame and a placeholder; Phase 1 replaces the placeholder
 * with the three-column editor shell.
 */
import dynamic from 'next/dynamic';
import type { CommunityFeatures, CommunityRole, CommunityType } from '@propertypro/shared';
import { SidebarProvider } from '@/components/layout/sidebar-context';

/**
 * The sidebar is lazily loaded and reserves its 72px immediately.
 *
 * This route has no app shell, so `AppSidebar` and its transitive nav config
 * would otherwise land in the editor's initial payload — which took the route
 * over the 700 KiB hard budget before the canvas existed. Navigation is not
 * needed to paint an editor, so it loads after. The placeholder is the exact
 * collapsed width, so nothing reflows when it arrives.
 */
const AppSidebar = dynamic(
  () => import('@/components/layout/app-sidebar').then((m) => m.AppSidebar),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-full w-[72px] min-w-[72px] border-r border-edge bg-surface-card"
        aria-hidden="true"
      />
    ),
  },
);

export interface EditorFrameProps {
  communityId: number;
  communityName: string;
  communityType: CommunityType;
  role: CommunityRole;
  isUnitOwner: boolean;
  designation: string | null;
  features: CommunityFeatures;
  userName: string | null;
  plan: string | null;
  children?: React.ReactNode;
}

export function EditorFrame({
  communityId,
  communityName,
  communityType,
  role,
  isUnitOwner,
  designation,
  features,
  userName,
  plan,
  children,
}: EditorFrameProps) {
  return (
    <SidebarProvider>
      {/* The rail is hidden below 1024px — the phone gate (Phase 1) takes over
          before the editor is usable at that width anyway. */}
      <div className="hidden lg:block">
        <AppSidebar
          communityId={communityId}
          communityName={communityName}
          communityType={communityType}
          role={role}
          isUnitOwner={isUnitOwner}
          designation={designation}
          features={features}
          userName={userName}
          plan={plan}
          expandedOverride={false}
          showCollapseToggle={false}
        />
      </div>
      <main
        id="main-content"
        className="flex min-w-0 flex-1 flex-col overflow-hidden"
        aria-label="Website editor"
      >
        {children ?? <EditorPlaceholder communityName={communityName} />}
      </main>
    </SidebarProvider>
  );
}

/** Phase 0 stand-in. Replaced by the three-column shell in Phase 1. */
function EditorPlaceholder({ communityName }: { communityName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold text-content">Website editor</h1>
      <p className="max-w-prose text-sm text-content-secondary">
        {communityName} — the editor shell arrives in the next phase.
      </p>
    </div>
  );
}
