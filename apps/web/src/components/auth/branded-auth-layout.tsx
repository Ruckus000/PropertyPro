import type { AuthPageBranding } from '@/lib/auth/resolve-auth-page-branding';

interface BrandedAuthLayoutProps {
  branding: AuthPageBranding;
  heading: string;
  description: string;
  children: React.ReactNode;
  /** Container max-width class. Defaults to "max-w-sm". */
  maxWidth?: string;
}

/**
 * Shared layout for branded auth pages (login, forgot-password, reset-password, accept-invite).
 * Renders font links, themed container, community logo, heading, and description,
 * then renders page-specific content via children.
 */
export function BrandedAuthLayout({
  branding,
  heading,
  description,
  children,
  maxWidth = 'max-w-sm',
}: BrandedAuthLayoutProps) {
  return (
    <>
      {branding.fontLinks.map((href) => (
        <link key={href} rel="stylesheet" href={href} />
      ))}
      <main
        className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12"
        style={branding.cssVars as React.CSSProperties}
      >
        <div className={`w-full ${maxWidth} space-y-6`}>
          <div className="text-center">
            {branding.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={branding.logoUrl}
                alt={branding.communityName ?? 'Community logo'}
                className="mx-auto mb-4 h-16 w-16 rounded-lg object-contain"
              />
            )}
            <h1 className="text-2xl font-semibold text-gray-900">{heading}</h1>
            <p className="mt-2 text-sm text-gray-600">{description}</p>
          </div>
          {children}
        </div>
      </main>
    </>
  );
}
