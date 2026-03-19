import type { ReactNode } from 'react';
import { AppQueryProvider } from '@/components/providers/query-provider';

/**
 * Layout for the public signing route (/sign/[submissionExternalId]/[slug]).
 * Provides QueryClientProvider since this route is outside the authenticated layout.
 */
export default function SignLayout({ children }: { children: ReactNode }) {
  return <AppQueryProvider>{children}</AppQueryProvider>;
}
