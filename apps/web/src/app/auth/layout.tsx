import type { ReactNode } from 'react';

// Forces dynamic rendering so auth pages skip static prerender
// (works around Next 15 OuterLayoutRouter useContext prerender crash).
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
