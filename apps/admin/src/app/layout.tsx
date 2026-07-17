import type { Metadata } from 'next';
import { NavigationProgress } from '@/components/NavigationProgress';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'PropertyPro Operator Console',
  description: 'PropertyPro Platform Administration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900">
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
