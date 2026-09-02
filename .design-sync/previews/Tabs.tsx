import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Badge,
  Button,
  Separator,
} from '@propertypro/design-system';

const Frame = ({
  title,
  meta,
  badge,
  children,
}: {
  title: string;
  meta: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div className="w-full max-w-[640px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-content">{title}</p>
          {badge}
        </div>
        <p className="mt-1 text-xs text-content-secondary">{meta}</p>
      </div>
      <Button size="sm" variant="outline">
        Manage
      </Button>
    </div>
    <Separator className="my-4" />
    {children}
  </div>
);

export const ViolationDetail = () => (
  <Frame
    title="V-118 — Unapproved balcony enclosure"
    meta="Unit 1204 · cited 28 Aug 2026 under Article XII, §4"
    badge={
      <Badge variant="warning" size="sm">
        Hearing scheduled
      </Badge>
    }
  >
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="notices">Notices</TabsTrigger>
        <TabsTrigger value="photos">Photos</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="space-y-4 pt-3">
          <p className="text-sm text-content-secondary">
            A glass enclosure was installed on the east balcony without architectural approval. The
            board must give 14 days&rsquo; written notice before any hearing on a fine.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {[
              ['Courtesy notice', 'Sent 29 Aug 2026'],
              ['Hearing', '11 Sep 2026, 6:30 PM'],
              ['Cure deadline', '25 Sep 2026'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-edge bg-surface-subtle p-3">
                <p className="text-xs uppercase tracking-wide text-content-tertiary">{label}</p>
                <p className="mt-1 text-sm text-content">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </TabsContent>
      <TabsContent value="notices">
        <p className="pt-3 text-sm text-content-secondary">Two notices on file.</p>
      </TabsContent>
      <TabsContent value="photos">
        <p className="pt-3 text-sm text-content-secondary">Four photographs attached.</p>
      </TabsContent>
      <TabsContent value="history">
        <p className="pt-3 text-sm text-content-secondary">Full audit trail.</p>
      </TabsContent>
    </Tabs>
  </Frame>
);

export const MeetingRecord = () => (
  <Frame
    title="Regular Board Meeting — September 2026"
    meta="24 Sep 2026 · Clubhouse · 48-hour notice posted 22 Sep"
    badge={
      <Badge variant="success" size="sm">
        Notice compliant
      </Badge>
    }
  >
    <Tabs defaultValue="agenda">
      <TabsList>
        <TabsTrigger value="agenda">Agenda</TabsTrigger>
        <TabsTrigger value="minutes">Minutes</TabsTrigger>
        <TabsTrigger value="attendance">Attendance</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
      </TabsList>
      <TabsContent value="agenda">
        <ol className="space-y-2 pt-3 text-sm text-content-secondary">
          <li>1. Roll call and confirmation of quorum</li>
          <li>2. Reserve funding for the 2027 milestone inspection</li>
          <li>3. Landscaping contract renewal — Delray Landscape Partners</li>
          <li>4. Owner comment period</li>
        </ol>
      </TabsContent>
      <TabsContent value="minutes">
        <p className="pt-3 text-sm text-content-secondary">Draft minutes pending board approval.</p>
      </TabsContent>
      <TabsContent value="attendance">
        <p className="pt-3 text-sm text-content-secondary">4 of 5 directors present; quorum met.</p>
      </TabsContent>
      <TabsContent value="documents">
        <p className="pt-3 text-sm text-content-secondary">Reserve study excerpt, two vendor bids.</p>
      </TabsContent>
    </Tabs>
  </Frame>
);
