import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
} from '@propertypro/design-system';

const roster = [
  ['u-0102', 'Unit 102 — Alvarez'],
  ['u-0104', 'Unit 104 — Rios'],
  ['u-0108', 'Unit 108 — Nakamura'],
  ['u-0201', 'Unit 201 — Whitfield'],
  ['u-0206', 'Unit 206 — Castellanos'],
  ['u-0210', 'Unit 210 — Petrov'],
  ['u-0303', 'Unit 303 — Okonkwo'],
  ['u-0307', 'Unit 307 — Lindqvist'],
  ['u-0311', 'Unit 311 — Duarte'],
  ['u-0402', 'Unit 402 — Delacroix'],
  ['u-0409', 'Unit 409 — Haddad'],
  ['u-0501', 'Unit 501 — Moreau'],
  ['u-0506', 'Unit 506 — Ferreira'],
  ['u-0604', 'Unit 604 — Kowalski'],
  ['u-0610', 'Unit 610 — Santoro'],
  ['u-0702', 'Unit 702 — Ibarra'],
  ['u-0708', 'Unit 708 — Brennan'],
  ['u-0803', 'Unit 803 — Nyberg'],
  ['u-0806', 'Unit 806 — Barnes'],
  ['u-0901', 'Unit 901 — Villanueva'],
  ['u-0907', 'Unit 907 — Tanaka'],
  ['u-1005', 'Unit 1005 — Adeyemi'],
  ['u-1102', 'Unit 1102 — Bergström'],
  ['u-1108', 'Unit 1108 — Marchetti'],
  ['u-1204', 'Unit 1204 — Vega'],
  ['u-1210', 'Unit 1210 — Oyelaran'],
  ['u-PH1', 'Penthouse 1 — Sandoval'],
  ['u-PH2', 'Penthouse 2 — Kaur'],
];

export const ScrolledUnitRoster = () => (
  <div className="w-full max-w-[560px] overflow-hidden rounded-md border border-edge bg-surface-card">
    <div className="border-b border-edge px-5 py-4">
      <p className="text-sm font-semibold text-content">Record an assessment payment</p>
      <p className="mt-1 text-xs text-content-secondary">
        Sunset Condos · 148 units · Q3 2026 quarterly assessment
      </p>
    </div>
    <div className="space-y-2 px-5 py-4">
      <Label htmlFor="su-unit">Unit</Label>
      <Select open defaultValue="u-1204">
        <SelectTrigger id="su-unit">
          <SelectValue placeholder="Choose a unit" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {roster.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-content-tertiary">
        Only units with an open balance for this assessment are listed.
      </p>
    </div>
  </div>
);
