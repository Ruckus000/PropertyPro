import {
  ChartEmptyState,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@propertypro/design-system';

const noop = () => {};

export const NoDataForPeriod = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Delinquency by aging bucket</CardTitle>
      <CardDescription>1 July – 31 August 2026 · Sunset Condos</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-64">
        <ChartEmptyState type="empty" />
      </div>
    </CardContent>
  </Card>
);

export const LoadFailedWithRetry = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Violations by rule cited</CardTitle>
      <CardDescription>Last 90 days · Palm Shores HOA</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-64">
        <ChartEmptyState type="error" onRetry={noop} />
      </div>
    </CardContent>
  </Card>
);

export const CustomMessage = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Work orders by trade</CardTitle>
      <CardDescription>Q3 2026 · Sunset Ridge Apartments</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-64">
        <ChartEmptyState
          type="empty"
          message="No work orders were logged in this quarter"
        />
      </div>
    </CardContent>
  </Card>
);
