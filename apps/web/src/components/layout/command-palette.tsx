'use client';

/**
 * Command Palette — Cmd+K search across pages, quick actions, and recent history.
 *
 * Uses the `cmdk` library for keyboard-navigable command list.
 * Page items are derived from nav-config.ts via getVisibleItems so that
 * role/feature gating is consistent with the sidebar.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Settings,
  Download,
  Upload,
  Wrench,
  Search,
  Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AnyCommunityRole, CommunityFeatures } from '@propertypro/shared';
import { useRecentPages } from '@/hooks/useRecentPages';
import { NAV_ITEMS, PM_NAV_ITEMS, PAGE_TITLES, getActiveItemId, getVisibleItems } from './nav-config';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: number | null;
  role: AnyCommunityRole | null;
  features: CommunityFeatures | null;
}

interface CommandItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  group: 'page' | 'action';
  keywords?: string;
}

function getCommandItems(
  communityId: number | null,
  role: AnyCommunityRole | null,
  features: CommunityFeatures | null,
): CommandItem[] {
  const cid = communityId;

  // Always-available items (no community required)
  const globalItems: CommandItem[] = [
    { id: 'settings', label: 'Settings', icon: Settings, href: cid ? `/settings?communityId=${cid}` : '/settings', group: 'page', keywords: 'notification preferences' },
  ];

  if (!cid) return globalItems;

  // Derive page items from nav-config, filtered by role & features
  const visibleNavItems = getVisibleItems(NAV_ITEMS, role, features);
  const pageItems: CommandItem[] = visibleNavItems.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: item.href(cid),
    group: 'page' as const,
    keywords: PAGE_TITLES[item.id]?.subtitle || undefined,
  }));

  // Extra page items not in nav-config
  const extraPages: CommandItem[] = [
    { id: 'export', label: 'Data Export', icon: Download, href: `/settings/export?communityId=${cid}`, group: 'page', keywords: 'download csv zip' },
  ];

  // Quick actions
  const actionItems: CommandItem[] = [
    { id: 'action-upload', label: 'Upload Document', icon: Upload, href: `/communities/${cid}/documents?communityId=${cid}`, group: 'action', keywords: 'add file' },
    { id: 'action-maintenance', label: 'Submit Maintenance Request', icon: Wrench, href: `/maintenance/submit?communityId=${cid}`, group: 'action', keywords: 'new repair' },
  ];

  return [...pageItems, ...extraPages, ...globalItems, ...actionItems];
}

export function CommandPalette({ open, onOpenChange, communityId, role, features }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { recentPages, addPage } = useRecentPages();
  const [search, setSearch] = useState('');

  const items = useMemo(
    () => getCommandItems(communityId, role, features),
    [communityId, role, features],
  );

  // Close on Escape (cmdk handles this internally, but we also handle it for the overlay)
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  // Global Cmd+K / Ctrl+K handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  // Track page visits for recent pages using nav-config's route matching
  useEffect(() => {
    const navItems = pathname.startsWith('/pm/') ? PM_NAV_ITEMS : NAV_ITEMS;
    const activeId = getActiveItemId(navItems, pathname);
    if (activeId) {
      const matchingItem = items.find((item) => item.id === activeId);
      if (matchingItem) {
        addPage(matchingItem.href, matchingItem.label);
      }
    }
  }, [pathname, items, addPage]);

  const handleSelect = useCallback(
    (href: string, label: string) => {
      addPage(href, label);
      onOpenChange(false);
      setSearch('');
      router.push(href);
    },
    [router, onOpenChange, addPage],
  );

  if (!open) return null;

  const pages = items.filter((i) => i.group === 'page');
  const actions = items.filter((i) => i.group === 'action');

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => {
          onOpenChange(false);
          setSearch('');
        }}
        aria-hidden="true"
      />

      {/* Command dialog */}
      <div className="relative mx-auto mt-[15vh] w-full max-w-[560px] px-4">
        <Command
          className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
          label="Search commands"
        >
          <div className="flex items-center border-b border-gray-100 px-4">
            <Search size={18} className="shrink-0 text-gray-400" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search pages, actions..."
              className="flex-1 border-0 bg-transparent px-3 py-4 text-sm outline-none placeholder:text-gray-400"
            />
            <kbd className="hidden shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-400 sm:inline-block">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[360px] overflow-y-auto p-2">
            <Command.Empty className="px-4 py-8 text-center text-sm text-gray-500">
              No results found.
            </Command.Empty>

            {/* Recent pages */}
            {!search && recentPages.length > 0 && (
              <Command.Group heading="Recent" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500">
                {recentPages.map((page) => (
                  <Command.Item
                    key={`recent-${page.path}`}
                    value={`recent ${page.label}`}
                    onSelect={() => handleSelect(page.path, page.label)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors data-[selected=true]:bg-gray-100"
                  >
                    <Clock size={16} className="shrink-0 text-gray-400" />
                    <span>{page.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Pages */}
            <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500">
              {pages.map((item) => (
                <Command.Item
                  key={item.id}
                  value={`${item.label} ${item.keywords ?? ''}`}
                  onSelect={() => handleSelect(item.href, item.label)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors data-[selected=true]:bg-gray-100"
                >
                  <item.icon size={16} className="shrink-0 text-gray-400" />
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Quick Actions */}
            <Command.Group heading="Quick Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500">
              {actions.map((item) => (
                <Command.Item
                  key={item.id}
                  value={`${item.label} ${item.keywords ?? ''}`}
                  onSelect={() => handleSelect(item.href, item.label)}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors data-[selected=true]:bg-gray-100"
                >
                  <item.icon size={16} className="shrink-0 text-gray-400" />
                  <span>{item.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
