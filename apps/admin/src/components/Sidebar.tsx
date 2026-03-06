'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, MonitorPlay, Settings, LogOut, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/clients', label: 'Clients', icon: LayoutGrid },
  { href: '/demo', label: 'Demos', icon: MonitorPlay },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const isSiteBuilder = pathname.includes('/site-builder');
  const [collapsed, setCollapsed] = useState(isSiteBuilder);

  return (
    <aside
      className={`flex h-screen flex-col border-r border-gray-200 bg-gray-900 transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Logo + collapse toggle */}
      <div className="flex h-14 items-center justify-between border-b border-gray-700 px-3">
        {!collapsed && (
          <>
            <span className="text-sm font-semibold text-white tracking-tight">
              PropertyPro
            </span>
            <span className="ml-2 rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">
              Admin
            </span>
          </>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2',
                active
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white',
              ].join(' ')}
              title={collapsed ? label : undefined}
            >
              <Icon size={16} />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-700 px-2 py-3">
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className={[
              'flex w-full items-center rounded-md text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors',
              collapsed ? 'justify-center px-2 py-2' : 'gap-2.5 px-3 py-2',
            ].join(' ')}
            title={collapsed ? 'Sign out' : undefined}
          >
            <LogOut size={16} />
            {!collapsed && 'Sign out'}
          </button>
        </form>
      </div>
    </aside>
  );
}
