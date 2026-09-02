import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Button,
  ShadcnBadge,
} from '@propertypro/design-system';

const ArcQueue = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Architectural review</h1>
    <p className="mt-1 text-sm text-content-secondary">Palm Shores HOA &middot; 5 submissions awaiting a decision</p>
    <div className="mt-6 space-y-3">
      {['Unit 22 — Impact window replacement', 'Unit 8 — Paver driveway extension', 'Unit 31 — Roof recoat'].map(
        (item) => (
          <div key={item} className="rounded-md border border-edge bg-surface-card px-4 py-3">
            <p className="text-sm font-medium text-content">{item}</p>
            <p className="text-xs text-content-tertiary">Submitted under HB 1203 review window</p>
          </div>
        ),
      )}
    </div>
  </div>
);

export const TitleAndDescription = () => (
  <>
    <ArcQueue />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>Impact window replacement</SheetTitle>
          <SheetDescription>
            ARC-2026-0031 &middot; Unit 22 &middot; a written decision is due within 45 days of a complete
            application.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          <ShadcnBadge variant="secondary">Under review</ShadcnBadge>
          <p className="text-sm text-content-secondary">
            Owner proposes replacing eight sliding units with impact-rated glass in a bronze frame,
            matching the approved exterior palette.
          </p>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="outline">Request more detail</Button>
          <Button>Approve submission</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const TitleOnly = () => (
  <>
    <ArcQueue />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Denial reason</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          <p className="text-sm text-content-secondary">
            HB 1203 requires the specific rule or covenant relied on. Free-text alone is not enough.
          </p>
          <div className="rounded-md border border-edge bg-surface-subtle p-4 text-sm text-content">
            Covenant 4.2 &mdash; driveway surfaces must match the approved paver specification.
          </div>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="destructive">Record denial</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
