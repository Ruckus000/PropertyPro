import { AlertBanner, Button } from '@propertypro/design-system';

const noop = () => {};

const Label = ({ children }: { children: string }) => (
  <p className="text-xs uppercase tracking-wide text-content-tertiary">{children}</p>
);

export const Severities = () => (
  <div className="flex w-full flex-col gap-3">
    <AlertBanner
      status="danger"
      title="3 documents are past the 30-day posting deadline"
      description="§718.111(12)(g) requires association records to be posted within 30 days of creation. The 2025 audited financials are 11 days overdue."
    />
    <AlertBanner
      status="warning"
      title="Board meeting notice is due in 2 days"
      description="The 14-day owner notice for the 12 October budget meeting has not been posted."
    />
    <AlertBanner
      status="info"
      title="Your reserve study was completed in March 2023"
      description="PropertyPro displays reserve data exactly as reported. It does not assess whether funding is adequate."
    />
    <AlertBanner
      status="success"
      title="Milestone inspection report accepted"
      description="Phase 1 report filed with Miami-Dade County on 14 August 2026."
    />
    <AlertBanner
      status="neutral"
      title="This community is on the Essentials plan"
      description="Payments, violations and board governance are available on Professional."
    />
    <AlertBanner
      status="brand"
      title="E-voting is awaiting attorney review"
      description="§718.128 ballots stay disabled until counsel signs off on the secret-ballot flow."
    />
  </div>
);

export const Variants = () => (
  <div className="flex w-full flex-col gap-4">
    <div className="flex flex-col gap-2">
      <Label>filled</Label>
      <AlertBanner
        status="warning"
        variant="filled"
        title="6 units are 60+ days delinquent"
        description="Aggregate past-due balance is $48,230 across Sunset Condos."
      />
    </div>
    <div className="flex flex-col gap-2">
      <Label>subtle</Label>
      <AlertBanner
        status="warning"
        variant="subtle"
        title="6 units are 60+ days delinquent"
        description="Aggregate past-due balance is $48,230 across Sunset Condos."
      />
    </div>
    <div className="flex flex-col gap-2">
      <Label>outlined</Label>
      <AlertBanner
        status="warning"
        variant="outlined"
        title="6 units are 60+ days delinquent"
        description="Aggregate past-due balance is $48,230 across Sunset Condos."
      />
    </div>
  </div>
);

export const WithActionAndDismiss = () => (
  <div className="flex w-full flex-col gap-3">
    <AlertBanner
      status="warning"
      variant="subtle"
      title="Hearing notice not yet sent for V-2026-0148"
      description="Most bylaws require 14 days' notice before a fining committee hearing."
      action={
        <Button size="sm" variant="outline">
          Send notice
        </Button>
      }
    />
    <AlertBanner
      status="info"
      variant="subtle"
      title="Portal invitations were sent to 84 residents"
      description="12 invitations are still unopened after seven days."
      action={
        <Button size="sm" variant="ghost">
          Resend
        </Button>
      }
      dismissible
      onDismiss={noop}
    />
    <AlertBanner
      status="danger"
      title="We couldn't load the compliance score"
      description="The scoring service didn't respond. Your documents are unaffected."
      dismissible
      onDismiss={noop}
    />
  </div>
);
