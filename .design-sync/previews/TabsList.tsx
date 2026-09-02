import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Button,
  Separator,
} from '@propertypro/design-system';

export const PaymentsSections = () => (
  <div className="w-full max-w-[640px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-content">Payments</p>
        <p className="mt-1 text-xs text-content-secondary">
          Palm Shores HOA · 214 parcels · quarterly assessments
        </p>
      </div>
      <Button size="sm">Record payment</Button>
    </div>
    <Separator className="my-4" />
    <Tabs defaultValue="assessments">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="assessments">Assessments</TabsTrigger>
        <TabsTrigger value="delinquency">Delinquency</TabsTrigger>
        <TabsTrigger value="fees">Fee policy</TabsTrigger>
      </TabsList>
      <TabsContent value="assessments">
        <div className="space-y-3 pt-3">
          {[
            ['Q3 2026 quarterly assessment', 'Due 1 Jul 2026 · $425.00 per parcel', '198 paid'],
            ['Roof reserve special assessment', 'Due 1 Sep 2026 · $1,800.00 per parcel', '61 paid'],
            ['Q2 2026 quarterly assessment', 'Closed 1 Apr 2026 · $425.00 per parcel', '214 paid'],
          ].map(([name, meta, paid]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-4 rounded-md border border-edge bg-surface-subtle px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-content">{name}</p>
                <p className="text-xs text-content-tertiary">{meta}</p>
              </div>
              <p className="shrink-0 text-sm font-medium tabular-nums text-content">{paid}</p>
            </div>
          ))}
        </div>
      </TabsContent>
      <TabsContent value="overview">
        <p className="pt-3 text-sm text-content-secondary">Collections at a glance.</p>
      </TabsContent>
      <TabsContent value="delinquency">
        <p className="pt-3 text-sm text-content-secondary">11 parcels past 45 days.</p>
      </TabsContent>
      <TabsContent value="fees">
        <p className="pt-3 text-sm text-content-secondary">Late fee and interest policy.</p>
      </TabsContent>
    </Tabs>
  </div>
);

export const FullWidthList = () => (
  <div className="w-full max-w-[560px] rounded-md border border-edge bg-surface-card px-5 py-4">
    <p className="text-sm font-semibold text-content">Resident directory</p>
    <p className="mt-1 text-xs text-content-secondary">Sunset Condos · 148 units</p>
    <Separator className="my-4" />
    <Tabs defaultValue="owners">
      <TabsList className="w-full">
        <TabsTrigger value="owners" className="flex-1">
          Owners
        </TabsTrigger>
        <TabsTrigger value="tenants" className="flex-1">
          Tenants
        </TabsTrigger>
        <TabsTrigger value="invited" className="flex-1">
          Invited
        </TabsTrigger>
      </TabsList>
      <TabsContent value="owners">
        <ul className="divide-y divide-edge-subtle pt-3">
          {[
            ['Marisol Vega', 'Unit 1204 · board president'],
            ['Adaeze Okonkwo', 'Unit 311'],
            ['Henrik Bergström', 'Unit 1102'],
          ].map(([name, meta]) => (
            <li key={name} className="py-2">
              <p className="text-sm text-content">{name}</p>
              <p className="text-xs text-content-tertiary">{meta}</p>
            </li>
          ))}
        </ul>
      </TabsContent>
      <TabsContent value="tenants">
        <p className="pt-3 text-sm text-content-secondary">32 registered tenants.</p>
      </TabsContent>
      <TabsContent value="invited">
        <p className="pt-3 text-sm text-content-secondary">7 invitations outstanding.</p>
      </TabsContent>
    </Tabs>
  </div>
);
