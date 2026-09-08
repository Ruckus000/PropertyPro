import {
  Activity,
  Building2,
  CreditCard,
  Home,
  Inbox,
  Mail,
  MonitorPlay,
  Palette,
  Rocket,
  Settings,
  Ticket,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

/**
 * Shell signal keys: which live count each nav item's badge reflects. The
 * counts themselves are composed elsewhere (Wave 1 shell tasks) — this file
 * only declares which signal a given nav item cares about.
 */
export type NavSignalKey =
  | 'inbox'
  | 'tickets'
  | 'health'
  | 'onboarding'
  | 'billing'
  | 'leads'
  | 'deletion';

export interface AdminNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Which shell signal count badges this item. */
  signal?: NavSignalKey;
  /** Badge tone when the count is non-zero. Default neutral. */
  tone?: 'danger' | 'warning';
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

/**
 * Design nav structure for the redesigned console shell. Four hrefs below
 * (`/tickets`, `/health`, `/onboarding`, `/billing`) name routes that Wave 3
 * has not created yet — that is deliberate, not a bug: this config is the
 * single source every later shell task (rail, search, breadcrumbs) reads, and
 * shipping it ahead of those routes lets those pages 404 gracefully in the
 * meantime rather than being invisible from the nav once they exist.
 */
export const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'Operate',
    items: [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: Home },
      { id: 'inbox', label: 'Inbox', href: '/inbox', icon: Inbox, signal: 'inbox' },
      { id: 'tickets', label: 'Tickets', href: '/tickets', icon: Ticket, signal: 'tickets' },
      { id: 'health', label: 'Health', href: '/health', icon: Activity, signal: 'health', tone: 'danger' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { id: 'clients', label: 'Clients', href: '/clients', icon: Building2 },
      { id: 'onboarding', label: 'Onboarding', href: '/onboarding', icon: Rocket, signal: 'onboarding' },
      { id: 'billing', label: 'Billing', href: '/billing', icon: CreditCard, signal: 'billing', tone: 'warning' },
      { id: 'leads', label: 'Leads', href: '/leads', icon: Mail, signal: 'leads' },
      { id: 'demos', label: 'Demos', href: '/demo', icon: MonitorPlay },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        id: 'deletion',
        label: 'Deletion requests',
        href: '/deletion-requests',
        icon: Trash2,
        signal: 'deletion',
        tone: 'warning',
      },
      { id: 'templates', label: 'Site templates', href: '/site-templates', icon: Palette },
      { id: 'settings', label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

/** Flat list of every nav item, for the command palette / search. */
export const NAV_PAGES = NAV_GROUPS.flatMap((group) =>
  group.items.map(({ id, label, href }) => ({ id, label, href })),
);

const ALL_NAV_ITEMS: AdminNavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/**
 * Resolves a pathname to the nav item whose href is the longest matching
 * prefix (exact match or `href + '/'` prefix), so `/clients/12` resolves to
 * `clients` rather than falling through to `null`.
 */
export function getActiveNavId(pathname: string): string | null {
  let best: AdminNavItem | null = null;
  for (const item of ALL_NAV_ITEMS) {
    const isHit = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (isHit && (!best || item.href.length > best.href.length)) {
      best = item;
    }
  }
  return best?.id ?? null;
}

/** Page title for the active section, falling back to the app name. */
export function getPageTitle(pathname: string): string {
  const activeId = getActiveNavId(pathname);
  return NAV_PAGES.find((page) => page.id === activeId)?.label ?? 'PropertyPro Ops';
}
