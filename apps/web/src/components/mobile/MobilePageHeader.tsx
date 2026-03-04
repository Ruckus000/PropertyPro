'use client';

/**
 * Shared themed header for mobile pages.
 * Uses CSS variable --theme-primary with fallback to brand blue.
 */
export function MobilePageHeader({ children }: { children: React.ReactNode }) {
  return (
    <header
      className="px-4 py-3 text-white text-base font-semibold"
      style={{ backgroundColor: 'var(--theme-primary, #2563EB)' }}
    >
      {children}
    </header>
  );
}
