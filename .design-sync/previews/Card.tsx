import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button } from '@propertypro/design-system';

export const Composed = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Milestone Inspection</CardTitle>
      <CardDescription>
        Buildings three storeys or taller and 30+ years old require a milestone
        inspection under Florida statute.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        Sunset Condos was last inspected in March 2019. The next milestone
        inspection is due before 31 December 2026.
      </p>
    </CardContent>
    <CardFooter className="gap-3">
      <Button size="sm">Schedule inspection</Button>
      <Button size="sm" variant="outline">View report</Button>
    </CardFooter>
  </Card>
);

export const ContentOnly = () => (
  <Card className="max-w-2xl">
    <CardContent>
      <p className="text-sm text-content-secondary">
        A bare card with content only — the surface, border and radius come from
        the token layer.
      </p>
    </CardContent>
  </Card>
);
