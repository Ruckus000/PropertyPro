import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Badge,
  Button,
  Separator,
} from '@propertypro/design-system';

export const PanelWithTable = () => (
  <div className="w-full max-w-[640px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-content">Transparency page</p>
        <p className="mt-1 text-xs text-content-secondary">
          Sunset Condos · records published under §718.111(12)(g)
        </p>
      </div>
      <Button size="sm" variant="outline">
        Preview page
      </Button>
    </div>
    <Separator className="my-4" />
    <Tabs defaultValue="documents">
      <TabsList>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="meetings">Meetings</TabsTrigger>
        <TabsTrigger value="reserves">Reserves</TabsTrigger>
      </TabsList>
      <TabsContent value="documents">
        <div className="pt-3">
          <ul className="divide-y divide-edge-subtle">
            {[
              ['Declaration of condominium', 'Posted 4 Mar 2026', 'success', 'On time'],
              ['Adopted budget — FY 2026', 'Posted 18 Dec 2025', 'success', 'On time'],
              ['Milestone inspection report', 'Created 2 Aug 2026', 'danger', 'Overdue 3 days'],
              ['Insurance certificate', 'Created 22 Aug 2026', 'warning', 'Due in 6 days'],
            ].map(([name, meta, tone, label]) => (
              <li key={name as string} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-content">{name as string}</p>
                  <p className="text-xs text-content-tertiary">{meta as string}</p>
                </div>
                <Badge variant={tone as 'success' | 'warning' | 'danger'} size="sm">
                  {label as string}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-content-tertiary">
            Documents must be posted within 30 days of creation.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="meetings">
        <p className="pt-3 text-sm text-content-secondary">11 notices posted this year.</p>
      </TabsContent>
      <TabsContent value="reserves">
        <p className="pt-3 text-sm text-content-secondary">
          Structural integrity reserve study, posted 22 Jan 2026.
        </p>
      </TabsContent>
    </Tabs>
  </div>
);

export const PanelWithRoster = () => (
  <div className="w-full max-w-[560px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <p className="text-sm font-semibold text-content">Election — 2026 annual meeting</p>
    <p className="mt-1 text-xs text-content-secondary">
      Voter authentication is per unit; ballots stay secret (§718.128).
    </p>
    <Separator className="my-4" />
    <Tabs defaultValue="candidates">
      <TabsList>
        <TabsTrigger value="candidates">Candidates</TabsTrigger>
        <TabsTrigger value="turnout">Turnout</TabsTrigger>
        <TabsTrigger value="rules">Rules</TabsTrigger>
      </TabsList>
      <TabsContent value="candidates">
        <div className="space-y-3 pt-3">
          {[
            ['Marisol Vega', 'Unit 1204 · incumbent'],
            ['Adaeze Okonkwo', 'Unit 311'],
            ['Henrik Bergström', 'Unit 1102'],
            ['Priya Kaur', 'Penthouse 2'],
          ].map(([name, meta]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-4 rounded-md border border-edge bg-surface-subtle px-4 py-3"
            >
              <div>
                <p className="text-sm text-content">{name}</p>
                <p className="text-xs text-content-tertiary">{meta}</p>
              </div>
              <Button size="sm" variant="ghost">
                Profile
              </Button>
            </div>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="turnout">
        <p className="pt-3 text-sm text-content-secondary">61 of 148 units have voted.</p>
      </TabsContent>
      <TabsContent value="rules">
        <p className="pt-3 text-sm text-content-secondary">Quorum is 30% of voting interests.</p>
      </TabsContent>
    </Tabs>
  </div>
);
