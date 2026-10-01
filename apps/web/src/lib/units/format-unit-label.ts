export interface UnitLabelParts {
  unitNumber: string;
  building: string | null;
}

/** "Unit 1B", or "Bldg A • Unit 1B" when the unit has a building. Client-safe. */
export function formatUnitLabel(unit: UnitLabelParts): string {
  return unit.building ? `${unit.building} • Unit ${unit.unitNumber}` : `Unit ${unit.unitNumber}`;
}
