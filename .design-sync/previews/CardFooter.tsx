import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  StatusBadge,
} from '@propertypro/design-system';

/**
 * CardFooter — the flex action row at the bottom of a Card (p-6 pt-0, so it
 * hangs off the content above it). One filled primary button per card; every
 * other action is outline or ghost.
 */

export const Actions = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Violation Notice — Lot 214</CardTitle>
      <CardDescription>
        Unapproved exterior paint colour. Most bylaws require 14 days' notice
        before a hearing.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        The cure period closed on 22 August 2026 with no response from the owner
        of record.
      </p>
    </CardContent>
    <CardFooter className="gap-3">
      <Button size="sm">Schedule Hearing</Button>
      <Button size="sm" variant="outline">Send Reminder</Button>
      <Button size="sm" variant="ghost">Dismiss</Button>
    </CardFooter>
  </Card>
);

export const MetaAndAction = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Pool Resurfacing — Vendor Contract</CardTitle>
      <CardDescription>Clearwater Aquatics · $48,900 · 3-year term</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        Two competing bids are on file. Board approval was recorded in the
        18 August minutes.
      </p>
    </CardContent>
    <CardFooter className="justify-between gap-4 border-t border-edge pt-4">
      <span className="flex items-center gap-2 text-xs text-content-tertiary">
        <StatusBadge status="completed" label="Board Approved" size="sm" subtle />
        Renews 1 Oct 2029
      </span>
      <Button size="sm" variant="outline">View contract</Button>
    </CardFooter>
  </Card>
);

export const SingleAction = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>E-Voting</CardTitle>
      <CardDescription>
        Electronic voting under §718.128 requires per-unit voter authorisation
        and a secret ballot for elections.
      </CardDescription>
    </CardHeader>
    <CardFooter>
      <Button size="sm" variant="outline">Read the requirements</Button>
    </CardFooter>
  </Card>
);
