import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from 'sonner';
import { NavigationProgress } from '@/components/navigation/navigation-progress';
import "./globals.css";

/**
 * Fonts are VENDORED, not fetched from Google at build time.
 *
 * `next/font/google` downloads the files during `next build`, which put
 * `fonts.gstatic.com` on the critical path of every production build. That is
 * not hypothetical: `perf-check` failed twice in one day on unrelated PRs —
 * `Failed to fetch \`Fraunces\`` and `Failed to fetch \`Inter\`` — each after
 * Next's own three retries per weight. Because `perf-check` owns the only
 * production build and the required `Build` check gates on it, a blip at Google
 * made every PR in the repo unmergeable until a human re-ran it (#962).
 *
 * The files in ./fonts are the exact `latin` variable instances Google serves;
 * see fonts/README.md for the source URLs and how to refresh them.
 *
 * One variable file per family replaces the previous per-weight static
 * instances, so the full 100–900 range is available and total bytes are
 * roughly unchanged.
 */
const inter = localFont({
  src: "./fonts/inter-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-sans",
});

// "Florida Modern" display serif — matches the marketing landing page. Applied
// to page-title headings (font-display) only; body/data stay on Inter.
const fraunces = localFont({
  src: "./fonts/fraunces-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-display",
  // Default for local fonts is Arial; a serif needs a serif metric source or
  // the size-adjusted fallback fights the real face and CLS gets worse.
  // `next/font/google` picked one from the family's category automatically;
  // the local loader does not, so it has to be named.
  adjustFontFallback: "Times New Roman",
});

// NOTE: `next/font/local` derives the CSS family name from the FILE name, so
// this call and the one in `(marketing)/layout.tsx` both emit the family
// `fraunces`. On a marketing page both stylesheets load and that family ends up
// with three @font-face rules (normal here, normal + italic there). Harmless
// while every descriptor agrees — but if the two calls ever diverge (different
// file, `display`, or `adjustFontFallback`) they will silently MERGE into one
// family rather than staying separate. Change them together.

export const metadata: Metadata = {
  title: "PropertyPro Florida",
  description: "Compliance and community management platform for Florida condominium associations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('propertypro.large-text')==='true')document.documentElement.classList.add('large-text')}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-surface-card text-content dark:bg-gray-950 dark:text-gray-100">
        <NavigationProgress />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface-card focus:px-4 focus:py-2 focus:text-content-link focus:underline"
        >
          Skip to main content
        </a>
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            className: 'font-sans',
          }}
        />
      </body>
    </html>
  );
}
