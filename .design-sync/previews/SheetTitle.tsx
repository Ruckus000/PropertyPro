import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Button,
  Separator,
} from '@propertypro/design-system';

const MeetingsPage = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Meetings</h1>
    <p className="mt-1 text-sm text-content-secondary">
      Owner meetings need 14 days&rsquo; notice; board meetings need 48 hours.
    </p>
    <div className="mt-6 space-y-3">
      {['Board meeting — 18 Sep 2026', 'Budget adoption — 02 Oct 2026', 'Annual meeting — 14 Nov 2026'].map((m) => (
        <div key={m} className="rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content">
          {m}
        </div>
      ))}
    </div>
  </div>
);

export const NoticeDetail = () => (
  <>
    <MeetingsPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>Budget adoption meeting</SheetTitle>
          <SheetDescription>2 October 2026 &middot; 6:30 PM &middot; Clubhouse, Sunset Condos</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-content-secondary">Notice posted</span>
            <span className="font-medium text-content">17 Sep 2026</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-content-secondary">Lead time</span>
            <span className="font-medium text-status-success">15 days &mdash; compliant</span>
          </div>
          <Separator />
          <p className="text-sm text-content-secondary">
            The proposed budget and reserve schedule were mailed with the notice, as required for a
            budget-adoption meeting.
          </p>
        </div>
        <SheetFooter className="mt-8">
          <Button variant="outline">Download notice</Button>
          <Button>Post agenda</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const LongTitleWraps = () => (
  <>
    <MeetingsPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>
            Special members&rsquo; meeting to approve the structural integrity reserve study funding plan
          </SheetTitle>
          <SheetDescription>Requires a majority of the total voting interests.</SheetDescription>
        </SheetHeader>
        <SheetFooter className="mt-8">
          <Button>Open notice builder</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
