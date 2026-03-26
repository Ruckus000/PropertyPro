'use client';

import { useCallback, useRef, useState } from 'react';

export interface UseReauthReturn {
  /** Open the re-auth modal and wait for the user to verify their identity. */
  triggerReauth: () => Promise<boolean>;
  /** Whether the modal is currently visible. */
  isOpen: boolean;
  /** Called by ReauthModal on successful password verification. */
  onSuccess: () => void;
  /** Called by ReauthModal when the user dismisses without verifying. */
  onCancel: () => void;
  /**
   * Called by ReauthModal with the entered password.
   * POSTs to /api/v1/reauth/verify which verifies the password server-side
   * and mints the pp-reauth cookie. Throws on failure.
   */
  verify: (password: string) => Promise<void>;
}

export function useReauth(): UseReauthReturn {
  const [isOpen, setIsOpen] = useState(false);
  const resolveRef = useRef<((success: boolean) => void) | null>(null);

  const triggerReauth = useCallback((): Promise<boolean> => {
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const onSuccess = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const onCancel = useCallback(() => {
    setIsOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const verify = useCallback(async (password: string): Promise<void> => {
    const res = await fetch('/api/v1/reauth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(body?.error?.message ?? 'Incorrect password');
    }
    onSuccess();
  }, [onSuccess]);

  return { triggerReauth, isOpen, onSuccess, onCancel, verify };
}
