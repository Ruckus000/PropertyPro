import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import { Toaster } from 'sonner';
import { NavigationProgress } from '@/components/navigation/navigation-progress';
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

// "Florida Modern" display serif — matches the marketing landing page. Applied
// to page-title headings (font-display) only; body/data stay on Inter.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-display",
});

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
