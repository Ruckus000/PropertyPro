import {
  ChartSkeleton,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@propertypro/design-system';

export const DelinquencyTrendLoading = () => (
  <Card className="w-full">
    <CardHeader>
      <CardTitle>Delinquency by aging bucket</CardTitle>
      <CardDescription>Trailing 12 months · Sunset Condos</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartSkeleton aspectRatio="16/9" />
    </CardContent>
  </Card>
);

export const ReportGridLoading = () => (
  <div className="grid w-full grid-cols-2 gap-4">
    <Card>
      <CardHeader>
        <CardTitle>Violations by rule</CardTitle>
        <CardDescription>Last 90 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartSkeleton aspectRatio="4/3" />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>Work orders by trade</CardTitle>
        <CardDescription>Last 90 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartSkeleton aspectRatio="4/3" />
      </CardContent>
    </Card>
  </div>
);

export const OccupancyDonutLoading = () => (
  <Card className="w-full max-w-2xl">
    <CardHeader>
      <CardTitle>Occupancy mix</CardTitle>
      <CardDescription>Owner-occupied vs. leased · 148 units</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex items-center gap-6">
        <div className="w-64 shrink-0">
          <ChartSkeleton aspectRatio="1/1" />
        </div>
        <div className="flex w-full flex-col gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    </CardContent>
  </Card>
);
