import type { BreadcrumbLink } from '@/components/shared/breadcrumbs';
import { SEGMENT_LABELS, humanize } from './segment-labels';

export interface AutoTrail {
  items: BreadcrumbLink[];
  currentLabel: string;
  /**
   * True when the final segment is a dynamic/unknown token (an entity id or an
   * unrecognised slug) rather than a known static section segment. The shell
   * uses this to decide whether to override the leaf label with the page's
   * <h1> (real entity name) — it does so only for dynamic leaves, so static
   * section pages keep their clean segment label.
   */
  leafIsDynamic: boolean;
}

/** Dashboard-family paths that ARE the user's home — no breadcrumb needed. */
const DASHBOARD_HOME_PATHS = new Set([
  '/dashboard',
  '/dashboard/apartment',
  '/dashboard/overview',
]);

function isDigits(segment: string | undefined): boolean {
  return segment !== undefined && /^\d+$/.test(segment);
}

/** UUID / opaque-token shaped dynamic segment (thread ids, draft ids, etc.). */
function isOpaqueId(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment) || /^[0-9a-f]{16,}$/i.test(segment);
}

function labelForSegment(segment: string): string {
  const known = SEGMENT_LABELS[segment];
  if (known) return known;
  if (isDigits(segment)) return `#${segment}`;
  if (isOpaqueId(segment)) return `#${segment.slice(0, 8)}`;
  return humanize(segment);
}

/**
 * A crumb href is "path-scoped" when the tenant is encoded in the URL path
 * (`/communities/{id}/…`, or the `/pm/…` portal). These MUST NOT carry a
 * `?communityId=` query param (the path segment is authoritative). Every other
 * (top-level) route resolves its tenant from the query on non-subdomain hosts,
 * so those crumbs must keep `?communityId=` — otherwise clicking one drops
 * tenant context and bounces to /select-community. See .claude/rules/design.md.
 */
function isPathScoped(href: string): boolean {
  return href.startsWith('/communities/') || href === '/pm' || href.startsWith('/pm/');
}

/**
 * Build a breadcrumb trail from a pathname (and the active community, so
 * top-level crumb hrefs keep their `?communityId=` tenant context). This is
 * what the shell renders for the parent crumbs.
 *
 * Returns `null` for the bare root and for the user's home dashboard, so the
 * shell shows only the (role-aware) Home crumb — which it then hides.
 *
 * Structural segments (`/communities/{id}`, the `pm` / `dashboard` portal
 * roots) stay in the accumulated href so nested links resolve, but do not emit
 * their own crumb — the Home crumb already covers "root".
 */
export function buildAutoTrail(
  pathname: string,
  communityId?: number | null,
): AutoTrail | null {
  if (DASHBOARD_HOME_PATHS.has(pathname)) return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs: BreadcrumbLink[] = [];
  const hrefParts: string[] = [];
  let lastSeg: string | undefined;

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg === undefined) continue;
    hrefParts.push(seg);
    const href = `/${hrefParts.join('/')}`;

    // Structural segments: keep in the href, but don't emit a visible crumb.
    if (seg === 'communities' && isDigits(segments[i + 1])) continue; // tenant-in-path plumbing
    if (isDigits(seg) && segments[i - 1] === 'communities') continue; // the tenant id itself
    if (seg === 'pm' && i === 0) continue; // PM portal root → covered by Home crumb
    if (seg === 'dashboard' && (i === 0 || segments[i - 1] === 'pm')) continue; // dashboard root

    const finalHref =
      communityId != null && !isPathScoped(href) ? `${href}?communityId=${communityId}` : href;
    crumbs.push({ label: labelForSegment(seg), href: finalHref });
    lastSeg = seg;
  }

  const leaf = crumbs[crumbs.length - 1];
  if (!leaf || lastSeg === undefined) return null;

  const items = crumbs.slice(0, -1);
  const leafIsDynamic = SEGMENT_LABELS[lastSeg] === undefined;
  return { items, currentLabel: leaf.label, leafIsDynamic };
}
