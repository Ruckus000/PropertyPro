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
        {children}
      </body>
    </html>
  );
}
