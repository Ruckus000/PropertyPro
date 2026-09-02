import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@propertypro/design-system';

export const CancelAndConfirm = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Publish the amended Rules &amp; Regulations?</AlertDialogTitle>
        <AlertDialogDescription>
          Owners are notified by email and the 30-day statutory posting clock is
          satisfied for this record.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Publish</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const DestructiveFooter = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Void assessment AS-2026-114?</AlertDialogTitle>
        <AlertDialogDescription>
          A $4,820 special assessment on Unit 0304 is reversed and the owner
          ledger is credited. The reversal is written to the audit log.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep assessment</AlertDialogCancel>
        <AlertDialogAction className="bg-status-danger text-content-inverse hover:bg-status-danger">
          Void assessment
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const FooterWhilePending = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Deny ARC application?</AlertDialogTitle>
        <AlertDialogDescription>
          HB 1203 requires a specific written reason citing the covenant relied
          on. Your reason will be delivered to Unit 508 with the decision.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled>Sending decision…</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
