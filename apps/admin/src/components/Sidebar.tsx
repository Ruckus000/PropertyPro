'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { ADMIN_COOKIE_OPTIONS } from '@/lib/auth/cookie-config';
import {
  BarChart3,
  LayoutGrid,
  MonitorPlay,
  Palette,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
  ShieldAlert,
  Mail,
  Inbox,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: typeof BarChart3;
  badge?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/clients', label: 'Clients', icon: LayoutGrid },
  { href: '/leads', label: 'Leads', icon: Mail },
  // `Mail` is taken by Leads; `Inbox` keeps the two distinguishable at a glance.
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/communities/rootless', label: 'Rootless Communities', icon: ShieldAlert },
  { href: '/deletion-requests', label: 'Deletion Requests', icon: Trash2, badge: true },
  { href: '/demo', label: 'Demos', icon: MonitorPlay },
  { href: '/site-templates', label: 'Site Templates', icon: Palette },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  coolingCount?: number;
}

export function Sidebar({ collapsed, onToggle, coolingCount: initialCoolingCount }: SidebarProps) {
  const pathname = usePathname();
  const [coolingCount, setCoolingCount] = useState(initialCoolingCount ?? 0);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  /**
   * Sign out client-side, matching apps/web's ProfileMenu.
   *
   * This replaces a `<form action="/api/auth/signout" method="POST">` that
   * posted to a route which has never existed in this app — clicking "Sign out"
   * 404'd and left the session intact.
   *
   * ADMIN_COOKIE_OPTIONS is required: the admin session cookie is named
   * `sb-admin-auth-token`, so a default browser client would clear the web
   * app's cookie name instead and leave the operator still signed in.
   *
   * We MUST inspect the returned `{ error }` rather than relying on a catch:
   * supabase-js resolves rather than throws on a failed logout, and its
   * `_signOut` returns early — *before* clearing the local session — for any
   * GoTrue failure that is not a 401/403/404 (a network error, a 5xx, or a 429
   * from the logout rate limit). Navigating away regardless would leave a live
   * `sb-admin-auth-token` behind while telling the operator they were signed
   * out; `/auth/login` is a public path, so middleware would not bounce them
   * and the next person at a shared workstation would inherit a privileged
   * console session. Retrying with `scope: 'local'` is not a fallback — that
   * path issues the same network call first.
   */
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      setSigningOut(false);
      setSignOutFailed(true);
      return;
    }

    try {
      const supabase = createBrowserClient(url, key, {
        cookieOptions: ADMIN_COOKIE_OPTIONS,
      });
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSigningOut(false);
        setSignOutFailed(true);
        return;
      }
    } catch {
      setSigningOut(false);
      setSignOutFailed(true);
      return;
    }

    // Hard navigation so middleware re-runs and the server sees the cleared cookie.
    window.location.href = '/auth/login';
  }

  useEffect(() => {
    // Only adopt a SUPPLIED count. Resetting to 0 when the prop is absent is
    // what made the badge blink off on every navigation: the loading state
    // renders the same shell, and a `?? 0` here overwrote a known-good count
    // with a placeholder before the fetch below could refill it.
    if (typeof initialCoolingCount === 'number') {
      setCoolingCount(initialCoolingCount);
    }
  }, [initialCoolingCount]);

  useEffect(() => {
    if (typeof initialCoolingCount === 'number') {
      return;
    }

    async function fetchCoolingCount() {
      try {
        const res = await fetch('/api/admin/deletion-requests?status=cooling');
        const data = await res.json();
        if (res.ok && data.requests) {
          setCoolingCount(data.requests.length);
        }
      } catch {
        // Silently fail — badge is non-critical
      }
    }
    fetchCoolingCount();
  }, [initialCoolingCount]);

  return (
    <aside
      className={[
        // Only the outer shell migrates to tokens: `bg-surface-inverse-subtle`
        // resolves to exactly the gray this used, and the right border divides
        // the sidebar from the light content area, so `border-edge` is correct.
        //
        // The dark INTERNALS below (the section dividers, the muted nav labels,
        // the hover and active pills, the count badge) deliberately stay on raw
        // ramp classes. The semantic layer is single-theme LIGHT: its entire
        // dark vocabulary is the two inverse surfaces plus inverse text, with no
        // dark border or muted-text token, so every mapping for them would be an
        // approximation. The muted label class in particular means "disabled" on
        // a light card but "primary nav label" here — same value, opposite
        // intent. Giving admin a dark-chrome vocabulary is a design-system
        // decision for packages/tokens, not something to improvise in a drain.
        'flex h-screen flex-col border-r border-edge bg-surface-inverse-subtle transition-all duration-200',
        collapsed ? 'w-16' : 'w-56',
      ].join(' ')}
    >
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-gray-700 px-3">
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-sm font-semibold text-white tracking-tight whitespace-nowrap">
              PropertyPro
            </span>
            <span className="rounded bg-coral-600 px-1.5 py-0.5 text-xs font-medium text-white">
              Admin
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          // `title` alone is not an accessible name — it is advisory, and
          // several screen readers do not announce it at all.
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronsRight size={16} aria-hidden="true" />
            : <ChevronsLeft size={16} aria-hidden="true" />}
        </button>
      </div>

      {/* Nav */}
      <nav aria-label="Operator console" className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          const showBadge = badge && coolingCount > 0;

          return (
            <Link
              key={href}
              href={href}
              // The active item was distinguished by colour ALONE. `aria-current`
              // is what conveys it to a screen reader, and to anyone who cannot
              // separate the two greys.
              aria-current={active ? 'page' : undefined}
              // When collapsed the label text is removed, leaving an icon-only
              // link — `title` is advisory, so it needs a real accessible name.
              aria-label={collapsed ? label : undefined}
              title={collapsed ? label : undefined}
              className={[
                'flex items-center rounded-md py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
                active
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
              ].join(' ')}
            >
              <Icon size={16} className="shrink-0" aria-hidden="true" />
              {!collapsed && (
                <span className="flex-1">{label}</span>
              )}
              {showBadge && (
                <span className={[
                  'rounded-full bg-yellow-500 text-xs font-bold text-gray-900',
                  collapsed ? 'absolute ml-3 -mt-3 h-4 min-w-4 flex items-center justify-center px-1' : 'px-1.5 py-0.5',
                ].join(' ')}>
                  {/* A bare number announces as "3" with no idea what of. */}
                  <span aria-hidden="true">{coolingCount}</span>
                  <span className="sr-only">
                    {coolingCount} pending deletion {coolingCount === 1 ? 'request' : 'requests'}
                  </span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-700 px-2 py-3">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          title={collapsed ? (signOutFailed ? 'Sign out failed — try again' : 'Sign out') : undefined}
          className={[
            'flex w-full items-center rounded-md py-2 text-sm font-medium transition-colors disabled:opacity-60',
            signOutFailed
              ? 'text-red-400 hover:bg-gray-800 hover:text-red-300'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white',
            collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
          ].join(' ')}
        >
          <LogOut size={16} className="shrink-0" aria-hidden="true" />
          {!collapsed && (signingOut ? 'Signing out…' : 'Sign out')}
        </button>
        {/* Never navigate away on failure: the session is still live, and
            silently landing on /auth/login would imply otherwise. */}
        {signOutFailed && !collapsed && (
          <p role="alert" className="mt-2 px-3 text-xs text-red-400">
            Sign out failed — you are still signed in. Try again.
          </p>
        )}
      </div>
    </aside>
  );
}
