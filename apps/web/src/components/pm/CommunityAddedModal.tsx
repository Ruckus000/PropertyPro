'use client';

/**
 * Post-creation confirmation modal. After a PM adds a community via Stripe
 * embedded checkout, Stripe redirects to
 * `/pm/dashboard/communities?added_session_id={CHECKOUT_SESSION_ID}`
 * (see createAddCommunityCheckout). This modal detects that param, confirms the
 * community was added, and strips the param on close so a refresh/back doesn't
 * re-open it. The session id is a UI signal only — community creation happens
 * via the Stripe webhook.
 */
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ADDED_SESSION_PARAM = 'added_session_id';

export function CommunityAddedModal() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const open = searchParams.get(ADDED_SESSION_PARAM) !== null;

  const handleClose = () => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(ADDED_SESSION_PARAM);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Community added</DialogTitle>
        </DialogHeader>
        <p className="py-2 text-sm text-content-secondary">
          Your new community is set up and its subscription is active. You can customize its
          public website any time from the community&rsquo;s Website settings.
        </p>
        <DialogFooter>
          <Button onClick={handleClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
