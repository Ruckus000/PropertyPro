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
      <body>{children}</body>
    </html>
  );
}
