import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { LARGE_TEXT_CLASS, LARGE_TEXT_INIT_SCRIPT } from '@propertypro/ui/tokens';
import { NavigationProgress } from '@/components/NavigationProgress';
import { ServiceWorkerRegistration } from '@/components/shell/ServiceWorkerRegistration';
import '../styles/globals.css';

/**
 * Geist (`--font-sans`) and Geist Mono (`--font-mono`) are the console's sans
 * and mono faces, the same as apps/web (Geist density plan, 2026-11-03). Before
 * that `styles/globals.css` named Inter as `--font-sans` but nothing LOADED it —
 * no next/font, no @font-face, no <link> anywhere in apps/admin — so every
 * screen silently fell back to system-ui.
 *
 * The fonts are served from `/_next` at build time, so the CSP needs nothing
 * beyond `font-src 'self'` and no request leaves for fonts.googleapis.com at
 * runtime.
 *
 * They are VENDORED (`./fonts/`) rather than fetched from Google during the
 * build: `next/font/google` downloads at build time, which twice took CI down on
 * unrelated PRs when `fonts.gstatic.com` was unreachable (#962). The files are
 * byte-identical copies of the ones `apps/web` uses — duplicated deliberately,
 * because `next/font/local` needs a literal path relative to this file and a
 * cross-package `../../../../` would break the moment either app moved. See
 * fonts/README.md.
 */
const geist = localFont({
  src: './fonts/geist-latin-var.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-sans',
});

const geistMono = localFont({
  src: './fonts/geist-mono-latin-var.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-mono',
});

// Display serif for page titles only (font-display); body/data stay on Geist.
// Vendored for the same reason as Geist (see above) — no italic face, since
// font-display is only ever used at weight 500, roman. `adjustFontFallback`
// is required here: the local loader's default fallback is Arial, and sizing
// a serif against a sans-serif fallback makes CLS worse, not better —
// `next/font/google` picks a fallback from the family's category
// automatically, the local loader does not, so it has to be named.
const fraunces = localFont({
  src: './fonts/fraunces-latin-var.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-display',
  adjustFontFallback: 'Times New Roman',
});

export const metadata: Metadata = {
  title: 'PropertyPro Operator Console',
  description: 'PropertyPro Platform Administration',
  // The operator console has no business being indexed.
  robots: { index: false, follow: false },
  // Served by `app/manifest.ts`. Declared on the ROOT layout so the login page
  // advertises it too — that is the page a browser most often has open when it
  // decides whether the site is installable.
  manifest: '/manifest.webmanifest',
  // `capable` is what makes an iOS home-screen launch open in its own window
  // instead of a Safari tab; `title` is the name under the icon, and is the
  // manifest's `short_name` because iOS reads this, not the manifest.
  appleWebApp: { capable: true, title: 'PP Ops', statusBarStyle: 'default' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // Large text is the default, as in apps/web; LARGE_TEXT_INIT_SCRIPT
      // removes the class for a browser that chose "standard", so hydration
      // must tolerate a className mismatch on this one element.
      className={`${geist.variable} ${geistMono.variable} ${fraunces.variable} ${LARGE_TEXT_CLASS}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: LARGE_TEXT_INIT_SCRIPT }} />
      </head>
      <body className="bg-surface-page text-content">
        <NavigationProgress />
        <ServiceWorkerRegistration />
        {/* Mirrors apps/web/src/app/layout.tsx. The target `#main-content` is
            on the <main> AdminShell renders for the whole (console) group, and
            on the <main> that error.tsx and not-found.tsx render — those sit
            OUTSIDE that group, so without their own id the link would be a dead
            anchor on exactly the pages a lost user is most likely to be on. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-coral-700 focus:underline"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
