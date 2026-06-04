import type { ReactNode } from 'react';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';
import { AppQueryProvider } from '@/components/providers/query-provider';

/**
 * Minimal layout for onboarding wizard pages.
 *
 * These pages render full-screen wizards and intentionally
 * skip the app shell (sidebar + topbar).
 */
// The condo/apartment wizards call TanStack Query mutation hooks
// (useSaveCondoStep / useCompleteCondoOnboarding and apartment equivalents), so
// this group needs a QueryClient — it renders outside the authenticated layout.
// Mirrors (auth)/layout.tsx and sign/layout.tsx. Without this, /onboarding/condo
// and /onboarding/apartment throw "No QueryClient set" during render.
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <AppQueryProvider>
      <AuthSessionSync />
      {children}
    </AppQueryProvider>
  );
}
