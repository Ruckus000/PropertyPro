import {
  PageContainer,
  PageBody,
  PageHeader,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ShadcnBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@propertypro/design-system';

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full rounded-md border border-edge bg-surface-page">{children}</div>
);

export const DefaultWidth = () => (
  <Shell>
    <PageContainer>
      <PageHeader
        title="Documents"
        description="Association records posted under §718.111(12)(g)."
        hideHelpButton
        actions={<Button size="sm">Upload Document</Button>}
      />
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Posted on time</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-content">16 of 18</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Past deadline</CardTitle>
            <CardDescription>Requires attention</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-content">3</p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  </Shell>
);

export const WideWidth = () => (
  <Shell>
    <PageContainer width="wide">
      <PageHeader
        title="Owner ledger"
        description="Sunset Condos · 148 units · balances as of 1 September 2026"
        hideHelpButton
        actions={
          <>
            <Button size="sm" variant="outline">
              Export
            </Button>
            <Button size="sm">Record payment</Button>
          </>
        }
      />
      <div className="mt-6 rounded-md border border-edge bg-surface-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Current</TableHead>
              <TableHead>90+ days</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>1204</TableCell>
              <TableCell>Marisol Ortega</TableCell>
              <TableCell>$0</TableCell>
              <TableCell>$0</TableCell>
              <TableCell>
                <ShadcnBadge variant="outline">Current</ShadcnBadge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>806</TableCell>
              <TableCell>Devon Ashby</TableCell>
              <TableCell>$412</TableCell>
              <TableCell>$1,880</TableCell>
              <TableCell>
                <ShadcnBadge variant="outline">Delinquent</ShadcnBadge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>402</TableCell>
              <TableCell>Priya Raman</TableCell>
              <TableCell>$412</TableCell>
              <TableCell>$0</TableCell>
              <TableCell>
                <ShadcnBadge variant="outline">Current</ShadcnBadge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  </Shell>
);

export const WithPageBody = () => (
  <Shell>
    <PageContainer>
      <PageHeader
        title="Notifications"
        description="The page gutter comes from PageContainer; the centred reading column comes from PageBody."
        hideHelpButton
      />
      <div className="mt-6">
        <PageBody width="prose">
          <Card>
            <CardContent>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-content">
                    Budget meeting notice posted
                  </p>
                  <p className="text-sm text-content-secondary">
                    The board posted the 12 October notice 14 days in advance.
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
                  <p className="text-sm font-medium text-content">
                    Violation V-2026-0148 escalated
                  </p>
                  <p className="text-sm text-content-secondary">
                    No response to the courtesy notice after 14 days. A hearing notice is due.
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
                  <p className="text-sm font-medium text-content">
                    2025 audited financials uploaded
                  </p>
                  <p className="text-sm text-content-secondary">
                    Posted to the owner portal within the 30-day statutory window.
                  </p>
                </div>
                <ShadcnBadge variant="outline">4 Aug</ShadcnBadge>
              </div>
            </CardContent>
          </Card>
        </PageBody>
      </div>
    </PageContainer>
  </Shell>
);
