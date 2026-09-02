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

const ResidentsPage = () => (
  <div className="space-y-4" aria-hidden="true">
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-content">Residents</h1>
        <p className="text-sm text-content-secondary">
          Sunset Condos · 210 residents across 148 units
        </p>
      </div>
      <div className="h-9 w-32 rounded-md bg-interactive" />
    </div>
    <div className="rounded-md border border-edge bg-surface-card">
      {[
        ['Angela Whitfield', 'Unit 0304 · Owner · Board President'],
        ['Marisol Vega', 'Unit 0402 · Owner'],
        ['Priya Raman', 'Unit 0712 · Tenant'],
        ['Carlos Mendez', 'Unit 0910 · Owner'],
        ['Theo Brandt', 'Unit 1102 · Owner'],
        ['Dennis Ruiz', 'Unit 1207 · Owner'],
      ].map(([name, meta]) => (
        <div key={name} className="border-b border-edge px-4 py-3">
          <p className="text-sm font-medium text-content">{name}</p>
          <p className="text-xs text-content-tertiary">{meta}</p>
        </div>
      ))}
    </div>
  </div>
);

/** The default scrim — AlertDialogContent renders AlertDialogOverlay for you. */
export const DefaultScrim = () => (
  <>
    <ResidentsPage />
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Priya Raman from Unit 0712?</AlertDialogTitle>
          <AlertDialogDescription>
            Portal access ends immediately. Her lease record and payment history
            are retained in the association&rsquo;s official records.
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
  </>
);

/** A lighter scrim, so the roster stays legible while the manager confirms. */
export const LightenedScrim = () => (
  <>
    <ResidentsPage />
    <AlertDialog open>
      <AlertDialogPortal>
        <AlertDialogOverlay className="bg-black/40" />
        <div className="fixed left-[50%] top-[50%] z-50 grid w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border border-edge bg-surface-card p-6 shadow-e3 sm:max-w-lg">
          <div className="space-y-2">
            <AlertDialogTitle>Resend 3 pending invitations?</AlertDialogTitle>
            <AlertDialogDescription>
              Marisol Vega, Theo Brandt and Dennis Ruiz have not accepted their
              invitation. Resending issues a fresh link and expires the old one.
            </AlertDialogDescription>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline">Cancel</Button>
            <AlertDialogAction>Resend invitations</AlertDialogAction>
          </div>
        </div>
      </AlertDialogPortal>
    </AlertDialog>
  </>
);
