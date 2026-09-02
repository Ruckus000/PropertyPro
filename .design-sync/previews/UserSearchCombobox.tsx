import {
  UserSearchCombobox,
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

export const InRoleAssignmentForm = () => (
  <Card className="w-full max-w-2xl">
    <CardHeader>
      <CardTitle>Promote a property manager</CardTitle>
      <CardDescription>
        Role assignment is a root-manager power. The change is written to the compliance audit log.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-2">
        <Label>Person</Label>
        <UserSearchCombobox communityId={1} value="" onChange={noop} />
        <p className="text-xs text-content-tertiary">
          Search by name, email, or unit. Only members of Sunset Condos are returned.
        </p>
      </div>
    </CardContent>
    <CardFooter className="gap-3">
      <Button size="sm">Assign role</Button>
      <Button size="sm" variant="ghost">
        Cancel
      </Button>
    </CardFooter>
  </Card>
);

export const WithSelectionAndClear = () => (
  <Card className="w-full max-w-2xl">
    <CardHeader>
      <CardTitle>Transfer the root manager role</CardTitle>
      <CardDescription>
        A community has at most one root manager. Transferring demotes you to property manager.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col gap-2">
        <Label>New root manager</Label>
        <UserSearchCombobox
          communityId={1}
          value="Dana Whitfield · manager@sunsetcondos.example"
          onChange={noop}
        />
        <p className="text-xs text-content-tertiary">
          Property manager since 2024 · currently holds board president designation.
        </p>
      </div>
    </CardContent>
  </Card>
);

export const CustomPlaceholder = () => (
  <div className="w-full max-w-lg">
    <div className="flex flex-col gap-2">
      <Label>Assign this maintenance request</Label>
      <UserSearchCombobox
        communityId={1}
        value=""
        onChange={noop}
        placeholder="Search managers and site staff..."
      />
      <p className="text-xs text-content-tertiary">
        Residents cannot be assigned work. Vendors are managed under Operations.
      </p>
    </div>
  </div>
);
