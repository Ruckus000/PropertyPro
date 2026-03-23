'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  LayoutGrid,
  MonitorPlay,
  Settings,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
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
  { href: '/deletion-requests', label: 'Deletion Requests', icon: Trash2, badge: true },
  { href: '/demo', label: 'Demos', icon: MonitorPlay },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const [coolingCount, setCoolingCount] = useState(0);

  useEffect(() => {
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
  }, []);

  return (
    <aside
      className={[
        'flex h-screen flex-col border-r border-gray-200 bg-gray-900 transition-all duration-200',
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
            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
              Admin
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          const showBadge = badge && coolingCount > 0;

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={[
                'flex items-center rounded-md py-2 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
                active
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
              ].join(' ')}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && (
                <span className="flex-1">{label}</span>
              )}
              {showBadge && (
                <span className={[
                  'rounded-full bg-yellow-500 text-xs font-bold text-gray-900',
                  collapsed ? 'absolute ml-3 -mt-3 h-4 min-w-4 flex items-center justify-center px-1' : 'px-1.5 py-0.5',
                ].join(' ')}>
                  {coolingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-700 px-2 py-3">
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            title={collapsed ? 'Sign out' : undefined}
            className={[
              'flex w-full items-center rounded-md py-2 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors',
              collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
            ].join(' ')}
          >
            <LogOut size={16} className="shrink-0" />
            {!collapsed && 'Sign out'}
          </button>
        </form>
      </div>
    </aside>
  );
}
