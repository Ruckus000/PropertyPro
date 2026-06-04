import type { ReactNode } from 'react';
import { AppQueryProvider } from '@/components/providers/query-provider';

// Forces dynamic rendering so auth pages skip static prerender
// (works around Next 15 OuterLayoutRouter useContext prerender crash).
export const dynamic = 'force-dynamic';

// /auth/accept-invite renders SetPasswordForm, which calls useAcceptInvitation
// (TanStack Query useMutation). These pages render outside the authenticated
// layout, so provide a QueryClient here. Mirrors (auth)/layout.tsx and sign/layout.tsx.
// Without this, /auth/accept-invite throws "No QueryClient set" during render.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AppQueryProvider>{children}</AppQueryProvider>;
}
