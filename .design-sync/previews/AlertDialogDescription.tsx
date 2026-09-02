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

export const ShortConsequence = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
        <AlertDialogDescription>
          The link sent to dennis.ruiz@example.com stops working immediately.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Revoke invitation</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const DescriptionWithList = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete the 2026 Reserve Study?</AlertDialogTitle>
        <AlertDialogDescription>
          Deleting this record also removes it from everywhere it is referenced:
        </AlertDialogDescription>
      </AlertDialogHeader>
      <ul className="list-disc space-y-2 pl-5 text-sm text-content-secondary">
        <li>The public transparency page for Sunset Condos</li>
        <li>The January 2026 board meeting packet</li>
        <li>Two open compliance checks for reserve funding</li>
      </ul>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep document</AlertDialogCancel>
        <AlertDialogAction className="bg-status-danger text-content-inverse hover:bg-status-danger">
          Delete anyway
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const StatutoryDescription = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Levy the special assessment?</AlertDialogTitle>
        <AlertDialogDescription>
          A roof replacement assessment of $4,820 per unit will be posted to all
          148 owner ledgers, payable in four quarterly instalments. Owners must
          receive written notice at least 14 days before the meeting at which the
          assessment is considered, and that notice was posted on 26 August 2026.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Not yet</AlertDialogCancel>
        <AlertDialogAction>Levy assessment</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
