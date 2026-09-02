import {
  UnitSearchCombobox,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Label,
} from '@propertypro/design-system';

const noop = () => {};

export const InWorkOrderForm = () => (
  <Card className="w-full max-w-2xl">
    <CardHeader>
      <CardTitle>New work order</CardTitle>
      <CardDescription>
        Attaching a unit routes the request to the right owner and keeps the ledger charge scoped.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-2">
        <Label htmlFor="wo-unit">Unit</Label>
        <UnitSearchCombobox communityId={1} value="" onChange={noop} inputId="wo-unit" />
        <p className="text-xs text-content-tertiary">
          Search by unit label, for example 1204 or 806. Leave blank for common-area work.
        </p>
      </div>
    </CardContent>
    <CardFooter className="gap-3">
      <Button size="sm">Create work order</Button>
      <Button size="sm" variant="ghost">
        Cancel
      </Button>
    </CardFooter>
  </Card>
);

export const WithSelection = () => (
  <Card className="w-full max-w-2xl">
    <CardHeader>
      <CardTitle>Record an assessment</CardTitle>
      <CardDescription>Special assessments post to the unit ledger immediately.</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-2">
        <Label htmlFor="assess-unit">Unit</Label>
        <UnitSearchCombobox communityId={1} value="1204" onChange={noop} inputId="assess-unit" />
        <p className="text-xs text-content-tertiary">
          Tower A · Floor 12 · owner-occupied since March 2021.
        </p>
      </div>
    </CardContent>
  </Card>
);

export const CustomPlaceholder = () => (
  <div className="w-full max-w-lg">
    <div className="flex flex-col gap-2">
      <Label htmlFor="lease-unit">Leased unit</Label>
      <UnitSearchCombobox
        communityId={1}
        value=""
        onChange={noop}
        inputId="lease-unit"
        placeholder="Search vacant units (e.g. 402)..."
      />
      <p className="text-xs text-content-tertiary">
        Only units without an active lease appear in this list.
      </p>
    </div>
  </div>
);
