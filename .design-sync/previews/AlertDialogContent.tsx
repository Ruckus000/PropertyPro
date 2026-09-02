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

export const DestructiveConfirmation = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove Priya Raman from Unit 0712?</AlertDialogTitle>
        <AlertDialogDescription>
          She loses portal access at Sunset Condos immediately. Her lease record,
          payment history and maintenance requests are retained for the
          association&rsquo;s official records.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction className="bg-status-danger text-content-inverse hover:bg-status-danger">
          Remove resident
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const NeutralConfirmation = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Discard unsaved website changes?</AlertDialogTitle>
        <AlertDialogDescription>
          You have three unpublished blocks on the Palm Shores HOA home page.
          Leaving now returns the page to the last published version.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep editing</AlertDialogCancel>
        <AlertDialogAction>Discard changes</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const ContentWithDetailBlock = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Close voting for the 2026 Board Election?</AlertDialogTitle>
        <AlertDialogDescription>
          Ballots can no longer be cast or changed once voting closes. Results
          are sealed until the tally is certified at the annual meeting.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="grid grid-cols-3 gap-4 rounded-md border border-edge bg-surface-muted p-4">
        {[
          ['Ballots cast', '84'],
          ['Quorum required', '75'],
          ['Closes', '14 Oct 2026'],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-content">{value}</p>
          </div>
        ))}
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep voting open</AlertDialogCancel>
        <AlertDialogAction>Close voting</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
