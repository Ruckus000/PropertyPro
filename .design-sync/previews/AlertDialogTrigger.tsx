import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Button,
} from '@propertypro/design-system';

/** Closed — the trigger is what renders, sitting in real row actions. */
export const TriggerInRowActions = () => (
  <div className="space-y-4">
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-content">Documents</h1>
        <p className="text-sm text-content-secondary">Sunset Condos · 42 posted</p>
      </div>
      <Button>Upload document</Button>
    </div>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Q3 2026 Operating Budget', 'Financial · 9 Jul 2026'],
        ['2026 Reserve Study', 'Financial · 18 Jan 2026'],
        ['Board Meeting Minutes — June 2026', 'Meetings · 24 Jun 2026'],
      ].map(([name, meta]) => (
        <div
          key={name}
          className="flex items-center justify-between border-b border-edge px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-content">{name}</p>
            <p className="text-xs text-content-tertiary">{meta}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">Delete</Button>
            </AlertDialogTrigger>
            <AlertDialogContent />
          </AlertDialog>
        </div>
      ))}
    </div>
  </div>
);

/** Open — the same trigger, showing the confirmation it guards. */
export const TriggerOpensConfirmation = () => (
  <div className="space-y-4">
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-content">Documents</h1>
        <p className="text-sm text-content-secondary">Sunset Condos · 42 posted</p>
      </div>
      <Button>Upload document</Button>
    </div>
    <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-3">
      <div>
        <p className="text-sm font-medium text-content">2026 Reserve Study</p>
        <p className="text-xs text-content-tertiary">Financial · 18 Jan 2026</p>
      </div>
      <AlertDialog open>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;2026 Reserve Study&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The study is removed from the owner-facing website and from the
              public transparency page. The deletion is recorded in the audit log.
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
    </div>
  </div>
);
