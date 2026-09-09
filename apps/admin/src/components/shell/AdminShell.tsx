'use client';

/**
 * The operator console's one and only shell. Rendered once by
 * `app/(console)/layout.tsx`, which means every console page is wrapped by it
 * and no page wires its own chrome — the arrangement that replaced
 * `AdminLayout`, which each of seventeen files imported by hand.
 *
 * It owns the `<main id="main-content">` landmark that the root layout's skip
 * link targets. Exactly one per rendered page: pages must not render their own.
 *
 * ## Why so much of the state is seeded rather than measured at first render
 *
 * `pinned` (localStorage), `mobile` and the rail's hover capability (both
 * `matchMedia`) are all browser-only facts, and this component is
 * server-rendered. Reading any of them during render produces markup the server
 * cannot reproduce, i.e. a hydration mismatch. Each is therefore seeded with the
 * value the server necessarily produces — unpinned, desktop — and corrected in
 * an effect after mount. The cost is a one-frame correction on a narrow or
 * touch-only viewport; the alternative is React discarding and re-rendering the
 * tree, which is strictly worse and logs an error.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AdminCommandPalette } from './AdminCommandPalette';
import { AdminDrawer } from './AdminDrawer';
import { AdminRail } from './AdminRail';
import { AdminTopBar } from './AdminTopBar';
import { CriticalBanner } from './CriticalBanner';
import { OfflineBanner } from './OfflineBanner';
import { getActiveNavId, getPageTitle } from './nav-config';
import { readPinned, writePinned } from './rail-preferences';
import { isSearchShortcut } from '@/lib/utils/search-shortcut';
import type { ShellSignals } from '@/lib/server/shell-signals';

/**
 * Rail-vs-drawer breakpoint. Spec decision D8: "Mobile (<900px) uses a `Sheet`
 * drawer." Deliberately not Tailwind's `md` (768px), so it is expressed here as
 * a media query rather than a utility class — nothing in the config names 900px.
 */
const MOBILE_QUERY = '(max-width: 899px)';

const SIGNAL_POLL_MS = 60_000;

/**
 * Routes where a narrow-viewport Back button is the primary way out, because the
 * rail is behind a drawer and these screens are reached from a list.
 */
const DETAIL_ROUTE = /^\/(?:clients|inbox|tickets)\/\d+/;

/**
 * Routes that render their own full-height layout and must not be squeezed
 * by the shell's centred `max-w-7xl px-4 py-6 md:px-8` content box: the demo
 * wizard's footer, the tabbed iframe preview, and the phone-frame preview all
 * size themselves against the FULL height available, and the padded
 * wrapper's `py-6` is exactly enough to push that below the fold (at 812px
 * tall, 44px over — 92px with the critical banner showing). These pages were
 * moved into `(console)` by Task 11; before that they owned their own
 * `h-screen` outside any shell. They are now `h-full`, sized against
 * whatever this branch gives them, so the branch and the pages change
 * together.
 */
const FULL_BLEED = /^\/demo\/(?:new|\d+\/(?:preview|mobile))$/;

export interface AdminShellProps {
  user: { email: string; initial: string };
  initialSignals: ShellSignals;
  children: ReactNode;
}

export function AdminShell({ user, initialSignals, children }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [pinned, setPinned] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [signals, setSignals] = useState(initialSignals);
  // Tray read marker. Local to the session for now; Wave 4 replaces this with
  // the persisted preferences API so it survives a reload and follows the
  // operator across devices.
  const [readAt, setReadAt] = useState<string | null>(null);

  useEffect(() => {
    setPinned(readPinned());
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(MOBILE_QUERY);
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // Poll the derived signals so badge counts, the tray and the critical banner
  // stay live without a reload. Skipped while the tab is hidden: a console left
  // open in a background tab for a day would otherwise run ~1,440 pointless
  // server round-trips, each one composing seven providers.
  //
  // A tick that falls due while the tab is hidden is simply lost — the next
  // one is up to SIGNAL_POLL_MS later, so a returning operator could be
  // reading data up to a minute stale with no indication. The
  // `visibilitychange` listener below re-fires `tick` the moment the tab
  // becomes visible again, to catch up immediately instead of waiting for
  // the next interval tick. That listener and the interval can now land
  // close together (switch tabs right as the interval is due), so `tick`
  // guards against overlapping in-flight requests itself — it did not
  // before this fix.
  useEffect(() => {
    let inFlight = false;
    const tick = async () => {
      if (document.visibilityState !== 'visible' || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch('/api/admin/shell/signals', { cache: 'no-store' });
        if (res.ok) setSignals((await res.json()).data as ShellSignals);
      } catch {
        // Offline or a dropped request — keep the last good signals rather than
        // blanking every badge. `OfflineBanner` is what tells the operator the
        // numbers may be stale.
      } finally {
        inFlight = false;
      }
    };
    const id = window.setInterval(tick, SIGNAL_POLL_MS);
    const onVisibilityChange = () => {
      void tick();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isSearchShortcut(event)) {
        // Chrome/Firefox bind ⌘K / Ctrl-K to the address bar's search.
        event.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (event.key === 'Escape') {
        // The drawer and the palette are Radix surfaces and dismiss themselves;
        // this is the belt to that braces, and keeps the behaviour true of any
        // future non-Radix overlay the shell owns. The notification tray closes
        // itself the same way (NotificationTray's own Escape listener) — its
        // open state lives inside AdminTopBar and is deliberately not lifted
        // here, since nothing outside the tray needs to read it.
        setDrawerOpen(false);
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A drawer left open across a navigation would cover the page just loaded.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const handlePinnedChange = useCallback((next: boolean) => {
    setPinned(next);
    writePinned(next);
  }, []);

  const handleMarkAllRead = useCallback(() => {
    setReadAt(new Date().toISOString());
  }, []);

  const activeId = getActiveNavId(pathname);

  return (
    <div className="flex h-screen overflow-hidden">
      {!mobile && (
        <AdminRail
          activeId={activeId}
          counts={signals.counts}
          pinned={pinned}
          onPinnedChange={handlePinnedChange}
          user={user}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          mobile={mobile}
          title={getPageTitle(pathname)}
          showBack={mobile && DETAIL_ROUTE.test(pathname)}
          onBack={() => router.back()}
          onOpenDrawer={() => setDrawerOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          signals={signals}
          readAt={readAt}
          onMarkAllRead={handleMarkAllRead}
        />
        {/* `generatedAt` is the stamp on the last signal payload that actually
            arrived, so while offline it is exactly "how old the numbers on
            screen are" — which is the sentence the banner wants to say. */}
        <OfflineBanner cachedAt={signals.generatedAt} />
        <CriticalBanner critical={signals.critical} mobile={mobile} />

        <main id="main-content" className="flex-1 overflow-y-auto bg-surface-page">
          {FULL_BLEED.test(pathname) ? (
            children
          ) : (
            <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</div>
          )}
        </main>
      </div>

      <AdminDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        activeId={activeId}
        counts={signals.counts}
        user={user}
      />
      <AdminCommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
