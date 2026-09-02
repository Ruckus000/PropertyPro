import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  StatusBadge,
} from '@propertypro/design-system';

/**
 * CardTitle — the semibold, tight-tracking, leading-none title line inside a
 * CardHeader. It carries no colour or size of its own beyond the type scale,
 * so it inherits the card's content colour. Shown in the full composition.
 */

export const Default = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Work Order WO-2214</CardTitle>
      <CardDescription>Elevator 2 stopped between floors — Tower A lobby.</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        Assigned to Bayline Elevator Service. Vendor acknowledged at 9:14 AM.
      </p>
    </CardContent>
  </Card>
);

export const WithStatus = () => (
  <Card className="max-w-2xl">
    <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
      <CardTitle>Annual Owner Meeting</CardTitle>
      <StatusBadge status="confirmed" label="Notice Met" size="sm" />
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        Scheduled for 14 November 2026. Notice was mailed and posted 21 days
        ahead, exceeding the 14-day statutory minimum for owner meetings.
      </p>
    </CardContent>
  </Card>
);

export const LongTitle = () => (
  <Card className="max-w-lg">
    <CardHeader>
      <CardTitle>
        Milestone Inspection &amp; Structural Integrity Reserve Study — Phase II
        Findings
      </CardTitle>
      <CardDescription>
        Prepared by Coastline Engineering, PE 68420, for Sunset Condos.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        A long title wraps on the card's own measure and keeps its tight
        tracking, so multi-line headings still read as one block.
      </p>
    </CardContent>
  </Card>
);
