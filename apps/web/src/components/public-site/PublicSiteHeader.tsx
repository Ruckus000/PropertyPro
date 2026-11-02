import type { CommunityTheme } from '@propertypro/theme';
import type { SiteNav } from '@/components/public-site/layouts/types';

interface PublicSiteHeaderProps {
  theme: CommunityTheme;
  /**
   * Website editor v3, Phase 11b-2 — the published page nav.
   *
   * Optional, following the `footer?` precedent in `layouts/types.ts`: test
   * files sit outside the `src/**` tsconfig include, so a required prop fails
   * at runtime in the layout tests rather than at typecheck.
   */
  nav?: SiteNav;
}

/** `''` is the home page's slug; every other page is one path segment. */
function navHref(slug: string): string {
  return slug === '' ? '/' : `/${slug}`;
}

/**
 * The public page nav (Phase 11b-2).
 *
 * Suppressed below two items (D10): every community today has exactly one page,
 * and a one-item nav is chrome with no function — shipping it would visibly
 * change every live site for no benefit.
 *
 * No client JS (D11). The overflow row scrolls horizontally on narrow viewports
 * instead of collapsing into a disclosure menu, because the public site has no
 * client island at all and a menu would add one to a route already near its
 * bundle budget.
 */
function PageNav({ nav }: { nav: SiteNav }) {
  if (nav.items.length < 2) return null;

  return (
    <nav aria-label="Site pages" className="mx-auto mt-3 max-w-6xl">
      <ul className="flex items-center gap-1 overflow-x-auto">
        {nav.items.map((item) => {
          const isCurrent = item.slug === nav.currentSlug;
          return (
            <li key={item.id}>
              <a
                href={navHref(item.slug)}
                aria-current={isCurrent ? 'page' : undefined}
                className={[
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm font-semibold',
                  'transition-colors hover:bg-surface-muted hover:text-content',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isCurrent ? 'bg-surface-muted text-content' : 'text-content-secondary',
                ].join(' ')}
              >
                {item.name}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Public site header: the community's logo and name as a wordmark in the
 * theme's heading font and primary colour on a quiet white bar, and an outline
 * "Resident Login" button. The colour lives in the words, not the bar.
 */
export function PublicSiteHeader({ theme, nav }: PublicSiteHeaderProps) {
  return (
    <header className="w-full border-b border-edge bg-surface-card px-6 py-4 site-sm:px-8 site-lg:px-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {theme.logoUrl ? (
            <img
              src={theme.logoUrl}
              alt={`${theme.communityName} logo`}
              // w-auto + object-contain renders a horizontal wordmark at its
              // natural aspect; a square logo still resolves to ~40×40. max-w
              // keeps a very wide wordmark from crowding the header.
              className="h-10 w-auto max-w-[200px] rounded-md object-contain"
            />
          ) : null}
          <span
            className="text-xl font-semibold leading-tight tracking-tight text-primary site-sm:text-2xl"
            style={{ fontFamily: `'${theme.fontHeading}', sans-serif` }}
          >
            {theme.communityName}
          </span>
        </div>
        <nav aria-label="Resident access" className="shrink-0">
          <a
            href="/auth/login"
            className="inline-flex min-h-11 items-center rounded-md border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-content-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Resident Login
          </a>
        </nav>
      </div>
      {nav ? <PageNav nav={nav} /> : null}
    </header>
  );
}
