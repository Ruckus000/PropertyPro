import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from '@propertypro/design-system';

const vendors = [
  ['apex', 'Apex Elevator Service — elevators'],
  ['atlantic', 'Atlantic Roofing & Waterproofing'],
  ['bayside', 'Bayside Pool Management'],
  ['biscayne', 'Biscayne Building Systems — HVAC'],
  ['coastal', 'Coastal Lift & Hoist'],
  ['delray', 'Delray Landscape Partners'],
  ['everglade', 'Everglade Pest Control'],
  ['flagler', 'Flagler Fire Protection'],
  ['gulfstream', 'Gulfstream Mechanical'],
  ['harborlight', 'Harborlight Janitorial'],
  ['islamorada', 'Islamorada Glass & Railings'],
  ['keystone', 'Keystone Structural Engineers'],
  ['lauderdale', 'Lauderdale Plumbing Co.'],
  ['mangrove', 'Mangrove Tree Service'],
  ['northbay', 'North Bay Electric'],
  ['oceanside', 'Oceanside Paving & Striping'],
  ['palmetto', 'Palmetto Locksmith & Access'],
  ['quayside', 'Quayside Security Systems'],
  ['redland', 'Redland Concrete Restoration'],
  ['seagrape', 'Seagrape Painting Contractors'],
  ['tamiami', 'Tamiami Garage Doors'],
  ['upperkeys', 'Upper Keys Window Film'],
  ['vizcaya', 'Vizcaya Interior Finishes'],
  ['windward', 'Windward Generator Service'],
];

export const VendorDirectory = () => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-5 py-4">
      <p className="text-sm font-semibold text-content">Contract renewal</p>
      <p className="mt-1 text-xs text-content-secondary">
        Sunset Condos · 24 approved vendors on the insured list
      </p>
    </div>
    <div className="space-y-2 px-5 py-4">
      <Label htmlFor="sd-vendor">Vendor</Label>
      <Select open defaultValue="apex">
        <SelectTrigger id="sd-vendor">
          <SelectValue placeholder="Search approved vendors" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {vendors.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-content-tertiary">
        Vendors whose certificate of insurance has lapsed are excluded from this list.
      </p>
    </div>
  </div>
);
