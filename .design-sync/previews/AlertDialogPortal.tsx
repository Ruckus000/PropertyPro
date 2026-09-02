import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  Button,
} from '@propertypro/design-system';

/**
 * Mounted from inside a clipped sidebar card — the portal lifts the
 * confirmation out of that overflow context so it centres on the viewport.
 */
export const EscapesClippedPanel = () => (
  <div className="grid grid-cols-3 gap-4">
    <div className="col-span-2 space-y-3">
      <h1 className="text-2xl font-semibold text-content">Site editor</h1>
      <p className="text-sm text-content-secondary">
        Palm Shores HOA · public website · 6 blocks on the home page
      </p>
      <div className="space-y-2 rounded-md border border-edge bg-surface-card p-4">
        {['Hero — Welcome to Palm Shores', 'Amenities grid', 'Board & management contacts'].map(
          (block) => (
            <div
              key={block}
              className="rounded-md border border-edge px-3 py-2 text-sm text-content-secondary"
            >
              {block}
            </div>
          ),
        )}
      </div>
    </div>
    <div className="h-40 overflow-hidden rounded-md border border-edge bg-surface-muted p-4">
      <p className="text-xs uppercase tracking-wide text-content-tertiary">Block actions</p>
      <p className="mt-2 text-sm text-content-secondary">Amenities grid</p>
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the amenities grid?</AlertDialogTitle>
            <AlertDialogDescription>
              The block is removed from the published Palm Shores HOA home page
              the next time you publish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-status-danger text-content-inverse hover:bg-status-danger">
              Remove section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </div>
);

/**
 * Explicit composition — overlay and panel are siblings inside
 * AlertDialogPortal, which is what AlertDialogContent does internally.
 */
export const ExplicitPortalComposition = () => (
  <div className="space-y-4">
    <h1 className="text-2xl font-semibold text-content">Assessments</h1>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['AS-2026-114', 'Roof replacement · $4,820 per unit'],
        ['AS-2026-097', 'Quarterly maintenance · $1,140 per unit'],
        ['AS-2025-088', 'Seawall repair · $2,300 per unit'],
      ].map(([id, detail]) => (
        <div key={id} className="flex items-center justify-between border-b border-edge px-4 py-3">
          <span className="text-sm font-medium text-content">{id}</span>
          <span className="text-xs text-content-tertiary">{detail}</span>
        </div>
      ))}
    </div>
    <AlertDialog open>
      <AlertDialogPortal>
        <AlertDialogOverlay />
        <div className="fixed left-[50%] top-[50%] z-50 grid w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border border-edge bg-surface-card p-6 shadow-e3 sm:max-w-lg">
          <div className="space-y-2">
            <AlertDialogTitle>Void assessment AS-2026-114?</AlertDialogTitle>
            <AlertDialogDescription>
              148 owner ledgers are credited $4,820 each and the reversal is
              written to the compliance audit log.
            </AlertDialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline">Keep assessment</Button>
            <AlertDialogAction className="bg-status-danger text-content-inverse hover:bg-status-danger">
              Void assessment
            </AlertDialogAction>
          </div>
        </div>
      </AlertDialogPortal>
    </AlertDialog>
  </div>
);
