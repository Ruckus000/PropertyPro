import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Badge,
  Separator,
} from '@propertypro/design-system';

export const ActiveAndDisabled = () => (
  <div className="w-full max-w-[640px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <div className="flex items-center gap-3">
      <p className="text-sm font-semibold text-content">ARC-2026-0042 — Impact window replacement</p>
      <Badge variant="info" size="sm">
        Under review
      </Badge>
    </div>
    <p className="mt-1 text-xs text-content-secondary">
      Unit 806 · submitted 14 Aug 2026 · committee decision due 13 Sep 2026
    </p>
    <Separator className="my-4" />
    <Tabs defaultValue="request">
      <TabsList>
        <TabsTrigger value="request">Request</TabsTrigger>
        <TabsTrigger value="attachments">Attachments</TabsTrigger>
        <TabsTrigger value="comments">Committee notes</TabsTrigger>
        <TabsTrigger value="decision" disabled>
          Decision
        </TabsTrigger>
      </TabsList>
      <TabsContent value="request">
        <div className="space-y-4 pt-3">
          <p className="text-sm text-content-secondary">
            Replacement of six sliding windows with impact-rated units in bronze frames, matching the
            approved exterior palette.
          </p>
          <p className="text-xs text-content-tertiary">
            The Decision tab unlocks once the committee records a vote. Under HB 1203 a denial must
            cite the specific rule or covenant relied on.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="attachments">
        <p className="pt-3 text-sm text-content-secondary">Three attachments on file.</p>
      </TabsContent>
      <TabsContent value="comments">
        <p className="pt-3 text-sm text-content-secondary">Two committee notes.</p>
      </TabsContent>
      <TabsContent value="decision">
        <p className="pt-3 text-sm text-content-secondary">No decision recorded.</p>
      </TabsContent>
    </Tabs>
  </div>
);

const Count = ({ children }: { children: React.ReactNode }) => (
  <span className="ml-2 rounded-full bg-surface-muted px-1.5 text-xs tabular-nums text-content-secondary">
    {children}
  </span>
);

export const TriggersWithCounts = () => (
  <div className="w-full max-w-[560px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <p className="text-sm font-semibold text-content">Maintenance queue</p>
    <p className="mt-1 text-xs text-content-secondary">
      Sunset Ridge Apartments · 35 work orders this quarter
    </p>
    <Separator className="my-4" />
    <Tabs defaultValue="open">
      <TabsList>
        <TabsTrigger value="open">
          Open<Count>9</Count>
        </TabsTrigger>
        <TabsTrigger value="scheduled">
          Scheduled<Count>4</Count>
        </TabsTrigger>
        <TabsTrigger value="closed">
          Closed<Count>22</Count>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="open">
        <ul className="divide-y divide-edge-subtle pt-3">
          {[
            ['WO-2026-0311 — Lobby elevator stalling', 'Tower A · reported 2 days ago'],
            ['WO-2026-0309 — Pool pump losing pressure', 'Pool deck · reported 4 days ago'],
            ['WO-2026-0304 — Garage door sensor fault', 'Level P2 · reported 9 days ago'],
          ].map(([name, meta]) => (
            <li key={name} className="py-2">
              <p className="text-sm text-content">{name}</p>
              <p className="text-xs text-content-tertiary">{meta}</p>
            </li>
          ))}
        </ul>
      </TabsContent>
      <TabsContent value="scheduled">
        <p className="pt-3 text-sm text-content-secondary">Four vendor visits booked this week.</p>
      </TabsContent>
      <TabsContent value="closed">
        <p className="pt-3 text-sm text-content-secondary">Closed in the last 90 days.</p>
      </TabsContent>
    </Tabs>
  </div>
);
