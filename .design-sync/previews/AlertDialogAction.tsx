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

/** Default: the action inherits the filled primary button treatment. */
export const DefaultAction = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Certify the election results?</AlertDialogTitle>
        <AlertDialogDescription>
          84 ballots were cast against a quorum of 75. Certifying publishes the
          tally to all owners and seats the three elected directors.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Not yet</AlertDialogCancel>
        <AlertDialogAction>Certify results</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** Destructive: tailwind-merge lets a className replace the filled colours. */
export const DestructiveAction = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete &ldquo;Board Meeting Minutes — June 2026&rdquo;?</AlertDialogTitle>
        <AlertDialogDescription>
          Minutes are an official record. Deleting removes them from the owner
          website; the removal itself is written to the compliance audit log.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep minutes</AlertDialogCancel>
        <AlertDialogAction className="bg-status-danger text-content-inverse hover:bg-status-danger">
          Delete minutes
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

/** Disabled while the underlying mutation is in flight. */
export const PendingAction = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Send the 14-day hearing notice?</AlertDialogTitle>
        <AlertDialogDescription>
          Unit 1207 will receive the notice by email and certified mail. The
          hearing cannot be held before 15 September 2026.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled>Sending notice…</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
