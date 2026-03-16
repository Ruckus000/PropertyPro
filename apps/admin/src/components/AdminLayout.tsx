'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';

const SIDEBAR_KEY = 'ppro-admin-sidebar-collapsed';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === 'true') setCollapsed(true);
  }, []);

  const handleToggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      <main className="flex-1 overflow-y-auto bg-gray-50 transition-all duration-200">
        {children}
      </main>
    </div>
  );
}
