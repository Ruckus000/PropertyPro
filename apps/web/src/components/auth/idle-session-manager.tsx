'use client';

/**
 * Role-aware idle session manager.
 *
 * Idle timeouts:
 *   - Privileged (admin_roles): 30 minutes
 *   - Residents + unknown: 60 minutes
 *
 * 2-minute warning modal before sign-out.
 * BroadcastChannel synchronises the timeout deadline across tabs.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@propertypro/shared';
import type { AnyCommunityRole } from '@propertypro/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'focus'] as const;
const WARNING_BEFORE_MS = 2 * 60 * 1000; // 2 minutes
const CHANNEL_NAME = 'pp-idle-sync';

type ChannelMessage = { deadline: number } | { type: 'stay' };

function getIdleTimeoutMs(role: AnyCommunityRole | null): number {
  if (role && (ADMIN_ROLES as readonly string[]).includes(role)) {
    return 30 * 60 * 1000; // 30 min for admin roles
  }
  return 60 * 60 * 1000; // 60 min for residents / unknown
}

interface IdleSessionManagerProps {
  role: AnyCommunityRole | null;
}

export function IdleSessionManager({ role }: IdleSessionManagerProps) {
  const [showWarning, setShowWarning] = useState(false);
  const deadlineRef = useRef<number>(Date.now() + getIdleTimeoutMs(role));
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const signOut = useCallback(async () => {
    const supabase = createBrowserClient();
    await supabase.auth.signOut({ scope: 'local' });
    // AuthSessionSync will handle the redirect via SIGNED_OUT event
  }, []);

  const scheduleTimers = useCallback((deadline: number) => {
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);

    const now = Date.now();
    const msToExpiry = deadline - now;
    const msToWarning = msToExpiry - WARNING_BEFORE_MS;

    if (msToExpiry <= 0) {
      void signOut();
      return;
    }

    if (msToWarning > 0) {
      warningTimerRef.current = setTimeout(() => setShowWarning(true), msToWarning);
    } else {
      // Already inside warning window
      setShowWarning(true);
    }

    expireTimerRef.current = setTimeout(() => {
      setShowWarning(false);
      void signOut();
    }, msToExpiry);
  }, [signOut]);

  const resetDeadline = useCallback(() => {
    const newDeadline = Date.now() + getIdleTimeoutMs(role);
    deadlineRef.current = newDeadline;
    setShowWarning(false);
    scheduleTimers(newDeadline);
    channelRef.current?.postMessage({ deadline: newDeadline } satisfies ChannelMessage);
  }, [role, scheduleTimers]);

  const handleStaySignedIn = useCallback(() => {
    resetDeadline();
    channelRef.current?.postMessage({ type: 'stay' } satisfies ChannelMessage);
  }, [resetDeadline]);

  useEffect(() => {
    // Initialise deadline and timers
    deadlineRef.current = Date.now() + getIdleTimeoutMs(role);
    scheduleTimers(deadlineRef.current);

    // Activity listeners
    function onActivity() { resetDeadline(); }
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    // BroadcastChannel for cross-tab sync
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = (ev: MessageEvent<ChannelMessage>) => {
        if ('type' in ev.data && ev.data.type === 'stay') {
          resetDeadline();
        } else if ('deadline' in ev.data) {
          deadlineRef.current = ev.data.deadline;
          scheduleTimers(ev.data.deadline);
        }
      };
    }

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
      channel?.close();
      channelRef.current = null;
    };
  }, [role, resetDeadline, scheduleTimers]);

  return (
    <AlertDialog open={showWarning} onOpenChange={(open) => { if (!open) handleStaySignedIn(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Still there?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ve been inactive for a while. For your security, you&apos;ll be signed out in
            2 minutes unless you continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void signOut()}>Sign out now</AlertDialogCancel>
          <AlertDialogAction onClick={handleStaySignedIn}>Stay signed in</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
