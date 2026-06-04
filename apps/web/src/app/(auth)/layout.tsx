import type { ReactNode } from 'react';
import { AppQueryProvider } from '@/components/providers/query-provider';

// Forces dynamic rendering so signup pages skip static prerender
// (works around Next 15 OuterLayoutRouter useContext prerender crash).
export const dynamic = 'force-dynamic';

// The signup form (and its sibling pages) call TanStack Query mutation hooks
// (useCreateSignup / useConfirmEmailVerification), so this group must provide a
// QueryClient — it renders outside the authenticated layout. Mirrors sign/layout.tsx.
// Without this, /signup throws "No QueryClient set" during render (Sentry PROPERTY-PRO-6).
export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return <AppQueryProvider>{children}</AppQueryProvider>;
}
