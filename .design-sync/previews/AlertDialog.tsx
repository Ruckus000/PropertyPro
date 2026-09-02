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

const DocumentsPage = () => (
  <div className="space-y-4" aria-hidden="true">
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-content">Documents</h1>
        <p className="text-sm text-content-secondary">
          Sunset Condos · 42 documents posted
        </p>
      </div>
      <div className="h-9 w-36 rounded-md bg-interactive" />
    </div>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Q3 2026 Operating Budget', 'Financial · posted 9 Jul 2026'],
        ['2026 Reserve Study', 'Financial · posted 18 Jan 2026'],
        ['Board Meeting Minutes — June 2026', 'Meetings · posted 24 Jun 2026'],
        ['Rules & Regulations (Rev. 2025)', 'Governing · posted 3 Mar 2025'],
      ].map(([name, meta]) => (
        <div key={name} className="border-b border-edge px-4 py-3">
          <p className="text-sm font-medium text-content">{name}</p>
          <p className="text-xs text-content-tertiary">{meta}</p>
        </div>
      ))}
    </div>
  </div>
);

export const DeleteDocumentConfirmation = () => (
  <>
    <DocumentsPage />
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;Q3 2026 Operating Budget&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            The document is removed from the owner-facing website immediately.
            An entry stays in the compliance audit log, so the deletion remains
            traceable under §718.111(12).
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
  </>
);

export const PublishBroadcastConfirmation = () => (
  <>
    <DocumentsPage />
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send emergency broadcast to 210 residents?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;Hurricane Ilsa — mandatory evacuation for Zone A effective 6:00 AM
            tomorrow.&rdquo; This sends email and SMS at once and cannot be recalled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Review again</AlertDialogCancel>
          <AlertDialogAction>Send broadcast</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
);
