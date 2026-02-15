import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: {
    template: '%s | PropertyPro Florida',
    default: 'Legal | PropertyPro Florida',
  },
  description: 'Legal documents for PropertyPro Florida',
};

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-gray-900 hover:text-blue-600">
            PropertyPro Florida
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link href="/legal/terms" className="text-gray-600 hover:text-gray-900">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="text-gray-600 hover:text-gray-900">
              Privacy Policy
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">{children}</main>

      <footer className="border-t border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-3xl px-6 py-6">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} PropertyPro Florida. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
