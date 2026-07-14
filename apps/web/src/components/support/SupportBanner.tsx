'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, X } from 'lucide-react';
import {
  getSupportCookieRootDomain,
  SUPPORT_SESSION_COOKIE,
} from '@propertypro/shared';

export function SupportBanner() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const hasCookie = document.cookie
      .split(';')
      .some((c) => c.trim().startsWith(`${SUPPORT_SESSION_COOKIE}=`));
    setVisible(hasCookie);
  }, []);

  if (!visible) return null;

  const handleEndSession = () => {
    // Clear the support session cookie
    const hostname = window.location.hostname;
    const rootDomain = getSupportCookieRootDomain(hostname);
    const cookieDomain = rootDomain ? `; domain=.${rootDomain}` : '';
    document.cookie = `${SUPPORT_SESSION_COOKIE}=; path=/; max-age=0; SameSite=Lax${cookieDomain}`;
    setVisible(false);
    router.push('/dashboard');
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed left-0 right-0 top-0 z-[9999] flex items-center justify-between bg-status-warning px-4 py-2 text-sm font-medium text-content-inverse"
    >
      <div className="flex items-center gap-2">
        <Eye size={16} aria-hidden="true" />
        <span>Support Mode — Read-Only</span>
      </div>
      <button
        type="button"
        onClick={handleEndSession}
        className="flex items-center gap-1.5 rounded-md border border-content-inverse/30 px-3 py-1 text-xs font-semibold text-content-inverse hover:bg-content-inverse/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-interactive"
      >
        <X size={12} aria-hidden="true" />
        End Session
      </button>
    </div>
  );
}
