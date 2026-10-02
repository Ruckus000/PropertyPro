/**
 * The one place that builds a Directory URL. Used by the permanent redirects
 * from the old /dashboard/units and /dashboard/residents pages and by every
 * in-app link, email and search result that points at the Directory, so none of
 * them goes through a redirect hop.
 */
export type DirectoryTab = 'units' | 'residents' | 'requests';

type Params = Record<string, string | number | readonly string[] | undefined | null>;

export function directoryHref(tab: DirectoryTab, params: Params = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === 'tab' || value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) query.append(key, v);
    } else {
      query.set(key, String(value));
    }
  }
  query.set('tab', tab);
  return `/dashboard/directory?${query.toString()}`;
}
