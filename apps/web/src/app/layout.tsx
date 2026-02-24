import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:text-blue-600 focus:underline"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
