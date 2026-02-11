import type { ReactNode } from 'react';
import { AuthSessionSync } from '@/components/auth/auth-session-sync';

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <AuthSessionSync />
      {children}
    </>
  );
}
