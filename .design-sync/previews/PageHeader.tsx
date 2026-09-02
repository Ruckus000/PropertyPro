import { PageHeader, Button } from '@propertypro/design-system';

export const TitleOnly = () => <PageHeader title="Settings" hideHelpButton />;

export const WithDescription = () => (
  <PageHeader
    title="Roles & Access"
    description="Promote or remove property managers, set board designations, and transfer the root manager role."
    hideHelpButton
  />
);

export const WithActions = () => (
  <PageHeader
    title="Documents"
    description="Association records posted under §718.111(12)(g). Documents must be posted within 30 days of creation."
    hideHelpButton
    actions={
      <>
        <Button variant="outline" size="sm">Export</Button>
        <Button size="sm">Upload Document</Button>
      </>
    }
  />
);
