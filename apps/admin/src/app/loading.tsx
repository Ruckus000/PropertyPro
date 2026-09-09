/**
 * Fallback for the one render-blocking gap Task 11 introduced: `(console)`'s
 * layout (`app/(console)/layout.tsx`) awaits `requireAdminPageSession()` and
 * then `getShellSignals()` — under `dynamic = 'force-dynamic'` — before it can
 * render anything. That order is load-bearing (the gate must run before the
 * service-role signal read; see the AUTHZ note there and
 * `__tests__/shell/no-admin-layout.test.ts`), so this file is a fallback, not
 * a reorder: before Task 11, `AdminLayout` was a synchronous client
 * component with no awaits, so the chrome painted immediately. Now a cold
 * load shows an empty body until both reads resolve.
 *
 * This is the nearest ancestor `loading.tsx` ABOVE the console layout — the
 * twelve `loading.tsx` files inside `(console)/**` each wrap their OWN
 * segment's children, not their layout's awaits, so none of them can cover
 * this gap. Next suspends on the nearest one while `(console)/layout.tsx` is
 * in flight, which is this file.
 *
 * `app/auth/loading.tsx` exists so this file does not also flash console
 * chrome on the login screen — Next resolves the nearest `loading.tsx` above
 * a segment, and that one is nearer for everything under `/auth`.
 *
 * Deliberately coarse: it approximates the shell's own proportions (the
 * rail's collapsed width, the top bar's height) with plain skeleton blocks,
 * not a second implementation of AdminRail/AdminTopBar. Server component, no
 * data access — it has to render before `requireAdminPageSession()` has
 * resolved.
 */
function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-muted ${className}`} />;
}

export default function ConsoleRootLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading console"
      className="flex h-screen overflow-hidden"
    >
      {/* Collapsed rail — AdminRail's own unpinned width is w-[72px]. */}
      <div className="flex h-full w-[72px] shrink-0 flex-col items-center gap-4 border-r border-edge-subtle bg-surface-card py-4">
        <Block className="size-7 rounded-sm" />
        <Block className="size-6 rounded-sm" />
        <Block className="size-6 rounded-sm" />
        <Block className="size-6 rounded-sm" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — AdminTopBar's own height is h-[60px]. */}
        <div className="flex h-[60px] shrink-0 items-center gap-3 border-b border-edge bg-surface-card px-4 md:px-8">
          <Block className="h-6 w-40" />
          <Block className="ml-auto size-8 rounded-full" />
        </div>

        {/* Coarse content skeleton. Carries `id="main-content"` because the root
            layout's skip link targets it and `AdminShell`'s <main> — the usual
            owner of that id — has not rendered yet while this fallback shows.
            The two never coexist, so there is no duplicate id. */}
        <div id="main-content" className="flex-1 overflow-hidden bg-surface-page p-8">
          <div className="mx-auto max-w-7xl space-y-4">
            <Block className="h-8 w-48" />
            <Block className="h-40 w-full rounded-2xl" />
            <Block className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
