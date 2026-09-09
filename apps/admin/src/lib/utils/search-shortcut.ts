/**
 * Copy of apps/web's `isSearchShortcut` (apps/web/src/lib/utils/search-shortcut.ts).
 *
 * Not re-exported from a shared package: this is 5 lines, and apps/admin does
 * not otherwise depend on apps/web. Copying beats a package export for
 * something this small (ponytail rung 6).
 */
export interface SearchShortcutEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export function isSearchShortcut(event: SearchShortcutEventLike): boolean {
  return (event.metaKey === true || event.ctrlKey === true) && event.key.toLowerCase() === 'k';
}
