import type { ReactNode } from 'react';

// Forces dynamic rendering so signup pages skip static prerender
// (works around Next 15 OuterLayoutRouter useContext prerender crash).
export const dynamic = 'force-dynamic';

export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
