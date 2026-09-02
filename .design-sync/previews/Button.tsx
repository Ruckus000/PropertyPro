import { Button } from '@propertypro/design-system';

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Upload Document</Button>
    <Button variant="secondary">Save Draft</Button>
    <Button variant="outline">Export Report</Button>
    <Button variant="ghost">Cancel</Button>
    <Button variant="destructive">Delete Violation</Button>
    <Button variant="link">View all meetings</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Small</Button>
    <Button>Default</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const States = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Normal</Button>
    <Button loading>Submitting</Button>
    <Button disabled>Disabled</Button>
    <Button variant="outline" disabled>Disabled outline</Button>
  </div>
);
