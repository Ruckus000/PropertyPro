import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Button,
  Textarea,
} from '@propertypro/design-system';

const AnnouncementsPage = () => (
  <div className="min-h-screen bg-surface-page p-6">
    <h1 className="text-2xl font-semibold text-content">Announcements</h1>
    <p className="mt-1 text-sm text-content-secondary">Sunset Condos &middot; last posted 21 Aug 2026</p>
    <div className="mt-6 space-y-3">
      {['Elevator modernization — phase 2', 'Hurricane shutter reminder', 'Pool resurfacing schedule'].map((a) => (
        <div key={a} className="rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content">{a}</div>
      ))}
    </div>
  </div>
);

export const CloseInFooter = () => (
  <>
    <AnnouncementsPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>New announcement</SheetTitle>
          <SheetDescription>Posted to the resident portal and emailed to the selected audience.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-content">Message</p>
          <Textarea
            rows={4}
            defaultValue={'The north elevator will be out of service 9 - 14 September for modernization. Please use the south elevator during that window.'}
          />
        </div>
        <SheetFooter className="mt-8">
          <SheetClose asChild>
            <Button variant="outline">Discard</Button>
          </SheetClose>
          <Button>Publish announcement</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);

export const BuiltInCloseAffordance = () => (
  <>
    <AnnouncementsPage />
    <Sheet open>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[400px]">
        <SheetHeader>
          <SheetTitle>Audience</SheetTitle>
          <SheetDescription>
            Every sheet renders a built-in close control in the top-right corner.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-2">
          {['All residents', 'Owners only', 'Tenants only', 'Board members'].map((aud) => (
            <div key={aud} className="rounded-md border border-edge bg-surface-card px-4 py-3 text-sm text-content">
              {aud}
            </div>
          ))}
        </div>
        <SheetFooter className="mt-8">
          <SheetClose asChild>
            <Button variant="ghost">Cancel</Button>
          </SheetClose>
          <Button>Save audience</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </>
);
