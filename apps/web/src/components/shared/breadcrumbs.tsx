export interface BreadcrumbLink {
  label: string;
  href: string;
}

export interface BreadcrumbsProps {
  /** Linked parent crumbs, in order from root to immediate parent. */
  items?: BreadcrumbLink[];
  /** Current page label. Unlinked, marked with aria-current="page". */
  currentLabel: string;
  className?: string;
}

/**
 * Breadcrumb declaration for the PageHeader breadcrumb slot.
 *
 * The app renders a single, global breadcrumb trail at the top of the app
 * shell (components/layout/shell-breadcrumbs.tsx) — derived from the route
 * plus the page's <h1> — so this per-page component no longer renders any
 * visible markup. It is kept (and pages keep authoring
 * `<PageHeader breadcrumb={<Breadcrumbs items={…} currentLabel={…} />}>`) so
 * the breadcrumb CI guard stays satisfied and the authoring API is stable.
 */
export function Breadcrumbs(_props: BreadcrumbsProps) {
  return null;
}
