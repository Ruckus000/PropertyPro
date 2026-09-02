import {
  ResidentSearchCombobox,
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

export const InViolationForm = () => (
  <Card className="w-full max-w-2xl">
    <CardHeader>
      <CardTitle>Log a violation</CardTitle>
      <CardDescription>
        Violations are recorded against the responsible resident so hearing notices reach the
        right person.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-2">
        <Label>Responsible resident</Label>
        <ResidentSearchCombobox communityId={1} value="" onChange={noop} />
        <p className="text-xs text-content-tertiary">
          Type a name or unit number. Only residents of Sunset Condos are searchable.
        </p>
      </div>
    </CardContent>
    <CardFooter className="gap-3">
      <Button size="sm">Continue</Button>
      <Button size="sm" variant="ghost">
        Cancel
      </Button>
    </CardFooter>
  </Card>
);

export const WithSelection = () => (
  <Card className="w-full max-w-2xl">
    <CardHeader>
      <CardTitle>Assign an ARC request</CardTitle>
      <CardDescription>
        HB 1203 requires a specific written reason for any denial, addressed to the applicant.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-2">
        <Label>Applicant</Label>
        <ResidentSearchCombobox
          communityId={1}
          value="Marisol Ortega · Unit 1204"
          onChange={noop}
        />
        <p className="text-xs text-content-tertiary">
          Owner of record since March 2021 · portal account active.
        </p>
      </div>
    </CardContent>
  </Card>
);

export const CustomPlaceholder = () => (
  <div className="w-full max-w-lg">
    <div className="flex flex-col gap-2">
      <Label>Add a resident to the fining committee</Label>
      <ResidentSearchCombobox
        communityId={1}
        value=""
        onChange={noop}
        placeholder="Search residents who are not board members..."
      />
      <p className="text-xs text-content-tertiary">
        Committee members may not be officers, directors, or their relatives.
      </p>
    </div>
  </div>
);
