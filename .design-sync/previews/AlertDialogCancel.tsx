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

/** Cancel is the outline half of the pair — one filled action per dialog. */
export const CancelBesideDestructive = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete the Q3 2026 budget?</AlertDialogTitle>
        <AlertDialogDescription>
          Owners lose access to the posted budget straight away. This cannot be
          undone from the portal.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep document</AlertDialogCancel>
        <AlertDialogAction className="bg-status-danger text-content-inverse hover:bg-status-danger">
          Delete document
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** Cancel carries the safe verb when the primary action is the risky one. */
export const CancelWithExplicitVerb = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Leave the site editor?</AlertDialogTitle>
        <AlertDialogDescription>
          Three unpublished blocks on the Palm Shores HOA home page will be
          discarded.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Stay and keep editing</AlertDialogCancel>
        <AlertDialogAction>Leave without saving</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** Disabled alongside a pending action so the dialog cannot be dismissed mid-write. */
export const CancelDisabledWhilePending = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Import 148 owners from CSV?</AlertDialogTitle>
        <AlertDialogDescription>
          Each owner receives a portal invitation. Rows that match an existing
          resident are skipped rather than duplicated.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled>Importing 62 of 148…</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
