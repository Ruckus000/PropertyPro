import { EmptyState, Button, Card, CardContent } from '@propertypro/design-system';

const Panel = ({ children }: { children: React.ReactNode }) => (
  <Card className="w-full">
    <CardContent>{children}</CardContent>
  </Card>
);

export const DocumentLibrary = () => (
  <Panel>
    <EmptyState
      icon="file-text"
      title="Build your document library"
      description="Upload governing documents, financials, and meeting minutes to stay compliant."
      action={<Button size="sm">Upload Document</Button>}
    />
  </Panel>
);

export const ComplianceTrackerReady = () => (
  <Panel>
    <EmptyState
      size="lg"
      icon="upload"
      title="Your compliance tracker is ready"
      description="We've mapped the categories Florida requires. Upload documents to start tracking your score."
      action={<Button>Upload First Document</Button>}
    />
  </Panel>
);

export const NoResultsInPanel = () => (
  <Panel>
    <EmptyState
      size="sm"
      icon="inbox"
      title="No violations match these filters"
      description="Try widening the date range or clearing the unit filter."
      action={
        <Button size="sm" variant="outline">
          Clear filters
        </Button>
      }
    />
  </Panel>
);

export const CommunityInGoodStanding = () => (
  <Panel>
    <EmptyState
      icon="shield-check"
      title="Community is in good standing"
      description="No open violations at Sunset Condos. Residents can still report concerns from the portal."
      action={
        <Button size="sm" variant="outline">
          View closed violations
        </Button>
      }
    />
  </Panel>
);
