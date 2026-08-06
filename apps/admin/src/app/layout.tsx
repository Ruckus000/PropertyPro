import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { NavigationProgress } from '@/components/NavigationProgress';
import '../styles/globals.css';

/**
 * `styles/globals.css` has named Inter as `--font-sans` since the console was
 * built, but nothing ever LOADED it — no next/font, no @font-face, no <link>
 * anywhere in apps/admin — so every screen silently fell back to system-ui and
 * the operator console matched none of the product's typography.
 *
 * `next/font/google` self-hosts the font files under `/_next` at build time, so
 * the CSP added in this same phase needs nothing beyond `font-src 'self'` and
 * no request leaves for fonts.googleapis.com at runtime.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'PropertyPro Operator Console',
  description: 'PropertyPro Platform Administration',
  // The operator console has no business being indexed.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gray-50 text-gray-900">
        <NavigationProgress />
        {/* Mirrors apps/web/src/app/layout.tsx. The target `#main-content` is
            on <main> in AdminLayout, and on the <main> that error.tsx and
            not-found.tsx render — those sit OUTSIDE the shell, so without
            their own id the link would be a dead anchor on exactly the pages
            a lost user is most likely to be on. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-coral-700 focus:underline"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
