import {
  PageBody,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ShadcnBadge,
} from '@propertypro/design-system';

const Stage = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full rounded-md border border-edge bg-surface-page p-6">{children}</div>
);

export const DefaultRhythm = () => (
  <Stage>
    <PageBody>
      <Card>
        <CardHeader>
          <CardTitle>Compliance summary</CardTitle>
          <CardDescription>Sunset Condos · §718.111(12)(g) posting obligations</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-content-secondary">
            94% of required categories are posted. Three documents are past the 30-day window.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Upcoming meetings</CardTitle>
          <CardDescription>Notice deadlines are tracked automatically</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-content-secondary">
            Budget meeting on 12 October 2026 — owner notice due 28 September.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent uploads</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-content-secondary">
            18 documents uploaded, 16 posted within the statutory window.
          </p>
        </CardContent>
      </Card>
    </PageBody>
  </Stage>
);

export const WidthScale = () => (
  <Stage>
    <div className="flex flex-col gap-4">
      <PageBody width="narrow" spacing="none">
        <Card>
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">
              width=&quot;narrow&quot; · ~512px
            </p>
            <p className="mt-1 text-sm font-medium text-content">Check your email</p>
            <p className="text-sm text-content-secondary">
              We sent a verification link to devon.ashby@example.com.
            </p>
          </CardContent>
        </Card>
      </PageBody>
      <PageBody width="prose" spacing="none">
        <Card>
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">
              width=&quot;prose&quot; · ~672px
            </p>
            <p className="mt-1 text-sm font-medium text-content">Budget meeting notice posted</p>
            <p className="text-sm text-content-secondary">
              The board posted the 12 October notice 14 days in advance.
            </p>
          </CardContent>
        </Card>
      </PageBody>
      <PageBody width="form" spacing="none">
        <Card>
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">
              width=&quot;form&quot; · ~768px
            </p>
            <p className="mt-1 text-sm font-medium text-content">Association contact</p>
            <p className="text-sm text-content-secondary">
              Shown on the public transparency page and on every statutory notice.
            </p>
          </CardContent>
        </Card>
      </PageBody>
      <PageBody width="content" spacing="none">
        <Card>
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-content-tertiary">
              width=&quot;content&quot; · ~896px
            </p>
            <p className="mt-1 text-sm font-medium text-content">Compliance hub</p>
            <p className="text-sm text-content-secondary">
              Document posting, meeting notices and reserve disclosures in one place.
            </p>
          </CardContent>
        </Card>
      </PageBody>
    </div>
  </Stage>
);

export const FormColumn = () => (
  <Stage>
    <PageBody width="form">
      <Card>
        <CardHeader>
          <CardTitle>Association contact</CardTitle>
          <CardDescription>
            Shown on the public transparency page and on every statutory notice.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="pb-name">Association name</Label>
              <Input id="pb-name" defaultValue="Sunset Condominium Association, Inc." />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="pb-email">Management email</Label>
              <Input id="pb-email" defaultValue="manager@sunsetcondos.example" />
            </div>
          </div>
        </CardContent>
        <CardFooter className="gap-3">
          <Button size="sm">Save changes</Button>
          <Button size="sm" variant="ghost">
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </PageBody>
  </Stage>
);

export const ProseColumn = () => (
  <Stage>
    <PageBody width="prose">
      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-content">Budget meeting notice posted</p>
              <p className="text-sm text-content-secondary">
                The board posted the 12 October budget meeting notice 14 days in advance.
              </p>
            </div>
            <ShadcnBadge variant="outline">2h ago</ShadcnBadge>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-content">Violation V-2026-0148 escalated</p>
              <p className="text-sm text-content-secondary">
                No response to the courtesy notice after 14 days. A hearing notice is now due.
              </p>
            </div>
            <ShadcnBadge variant="outline">Yesterday</ShadcnBadge>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-content">2025 audited financials uploaded</p>
              <p className="text-sm text-content-secondary">
                Posted to the owner portal within the 30-day statutory window.
              </p>
            </div>
            <ShadcnBadge variant="outline">4 Aug</ShadcnBadge>
          </div>
        </CardContent>
      </Card>
    </PageBody>
  </Stage>
);
