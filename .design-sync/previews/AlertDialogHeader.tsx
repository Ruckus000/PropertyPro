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

export const TitleAndDescription = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Cancel the 12 September hearing?</AlertDialogTitle>
        <AlertDialogDescription>
          The owner of Unit 1207 has already received the 14-day notice. Cancelling
          restarts the notice period if the hearing is rescheduled.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Keep hearing</AlertDialogCancel>
        <AlertDialogAction>Cancel hearing</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const HeaderWithSeverityFlag = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <span className="w-fit rounded-full bg-status-danger-bg px-3 py-1 text-xs font-semibold uppercase tracking-wide text-status-danger">
          Irreversible
        </span>
        <AlertDialogTitle>Delete Sunset Ridge Apartments?</AlertDialogTitle>
        <AlertDialogDescription>
          All 96 units, 214 resident accounts, documents and payment history are
          scheduled for permanent deletion after a 30-day recovery window.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction className="bg-status-danger text-content-inverse hover:bg-status-danger">
          Request deletion
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const HeaderWithShortTitleOnly = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Archive this work order?</AlertDialogTitle>
        <AlertDialogDescription>
          #WO-2418 · Elevator 2 door fault. Archived work orders stay searchable
          from the operations history.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Archive</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
