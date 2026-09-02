import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Button,
  Input,
} from '@propertypro/design-system';

const Toolbar = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Documents</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; 214 official records</p>
    <div className="mt-6 flex items-center gap-3 rounded-md border border-edge bg-surface-card p-4">
      <Input className="max-w-sm" placeholder="Search records" />
      {children}
    </div>
    <div className="mt-6 space-y-3">
      {['Declaration of condominium', '2026 adopted budget', 'Board meeting minutes — 21 Aug'].map((d) => (
        <div key={d} className="rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content">{d}</div>
      ))}
    </div>
  </div>
);

export const TriggerInToolbar = () => (
  <Sheet>
    <Toolbar>
      <SheetTrigger asChild>
        <Button variant="outline">Filters</Button>
      </SheetTrigger>
      <SheetTrigger asChild>
        <Button>Upload document</Button>
      </SheetTrigger>
    </Toolbar>
  </Sheet>
);

export const PanelOpenedByTrigger = () => (
  <Sheet open>
    <Toolbar>
      <SheetTrigger asChild>
        <Button variant="outline">Filters</Button>
      </SheetTrigger>
      <SheetTrigger asChild>
        <Button>Upload document</Button>
      </SheetTrigger>
    </Toolbar>
    <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
      <SheetHeader>
        <SheetTitle>Upload document</SheetTitle>
        <SheetDescription>
          Records posted more than 30 days after their creation date are flagged on the compliance report.
        </SheetDescription>
      </SheetHeader>
      <div className="mt-6 space-y-3">
        <p className="text-sm font-medium text-content">Title</p>
        <Input defaultValue="Reserve study — 2026 update" />
        <p className="mt-4 text-sm font-medium text-content">Category</p>
        <Input defaultValue="Financial" />
      </div>
      <SheetFooter className="mt-8">
        <Button variant="outline">Cancel</Button>
        <Button>Upload</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
