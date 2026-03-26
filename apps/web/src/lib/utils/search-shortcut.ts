export interface SearchShortcutEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}

export function isSearchShortcut(event: SearchShortcutEventLike): boolean {
  return (event.metaKey === true || event.ctrlKey === true) && event.key.toLowerCase() === 'k';
}
