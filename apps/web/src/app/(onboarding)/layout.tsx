import type { ReactNode } from 'react';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';

/**
 * Minimal layout for onboarding wizard pages.
 *
 * These pages render full-screen wizards and intentionally
 * skip the app shell (sidebar + topbar).
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthSessionSync />
      {children}
    </>
  );
}
