import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  StatusBadge,
} from '@propertypro/design-system';

/**
 * CardHeader — the p-6 header slot of a Card. It stacks its children with
 * space-y-1.5, which is what gives CardTitle + CardDescription their rhythm.
 * Shown inside the full Card composition, since it renders no surface itself.
 */

export const TitleAndDescription = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Architectural Review Request</CardTitle>
      <CardDescription>
        Unit 402 — screened lanai enclosure. Under HB 1203 a denial must cite the
        specific rule or covenant relied upon.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        Submitted by Marisol Delgado on 12 August 2026. The committee has 45 days
        to respond in writing.
      </p>
    </CardContent>
  </Card>
);

export const WithHeaderAction = () => (
  <Card className="max-w-2xl">
    <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
      <div className="min-w-0 space-y-1.5">
        <CardTitle>Reserve Study</CardTitle>
        <CardDescription>
          Structural Integrity Reserve Study for Sunset Condos, Tower A.
        </CardDescription>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status="overdue" size="sm" />
        <Button size="sm" variant="outline">Upload</Button>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        The last SIRS on file was completed in 2019 and must be refreshed every
        ten years for buildings three storeys or taller.
      </p>
    </CardContent>
  </Card>
);

export const HeaderOnly = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Board Meeting — 18 September 2026</CardTitle>
      <CardDescription>
        Notice posted 48 hours in advance to the community website and the
        conspicuous posting board.
      </CardDescription>
    </CardHeader>
  </Card>
);
