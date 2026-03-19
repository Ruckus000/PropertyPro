import type { CommunityTheme } from '@propertypro/theme';

interface PublicSiteHeaderProps {
  theme: CommunityTheme;
}

/**
 * Public site header — displays community logo/name with primary color background
 * and a "Resident Login" link.
 */
export function PublicSiteHeader({ theme }: PublicSiteHeaderProps) {
  return (
    <header
      className="w-full px-4 py-4 sm:px-6 lg:px-8"
      style={{ backgroundColor: theme.primaryColor }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {theme.logoUrl ? (
            <img
              src={theme.logoUrl}
              alt={`${theme.communityName} logo`}
              className="h-10 w-10 rounded-md object-cover"
            />
          ) : null}
          <span
            className="text-xl font-bold text-content-inverse"
            style={{ fontFamily: `'${theme.fontHeading}', sans-serif` }}
          >
            {theme.communityName}
          </span>
        </div>
        <nav>
          <a
            href="/auth/login"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-surface-card/20 text-content-inverse hover:bg-surface-card/30 transition-colors"
          >
            Resident Login
          </a>
        </nav>
      </div>
    </header>
  );
}
