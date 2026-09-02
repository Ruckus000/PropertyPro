import {
  ChecklistStepper,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ShadcnBadge,
} from '@propertypro/design-system';

const noop = () => {};

export const MoveInProgress = () => (
  <Card className="w-full">
    <CardHeader>
      <div className="flex items-center justify-between gap-4">
        <div>
          <CardTitle>Move-in checklist · Unit 806</CardTitle>
          <CardDescription>Lease #L-2026-0231 · 2 of 6 steps complete</CardDescription>
        </div>
        <ShadcnBadge variant="outline">In progress</ShadcnBadge>
      </div>
    </CardHeader>
    <CardContent>
      <ChecklistStepper
        onStepToggle={noop}
        onStepNotesChange={noop}
        steps={[
          {
            key: 'lease_signed',
            label: 'Lease signed',
            completed: true,
            completedBy: 'Dana Whitfield',
            completedAt: '2026-08-14T15:20:00Z',
          },
          {
            key: 'security_deposit',
            label: 'Security deposit recorded',
            completed: true,
            completedBy: 'Dana Whitfield',
            completedAt: '2026-08-14T15:41:00Z',
            autoCompleted: true,
          },
          {
            key: 'move_in_inspection',
            label: 'Move-in inspection scheduled',
            completed: false,
            actionLabel: 'Schedule Inspection',
            onAction: noop,
          },
          {
            key: 'keys_assigned',
            label: 'Keys/access cards assigned',
            completed: false,
          },
          {
            key: 'portal_account',
            label: 'Resident portal account created',
            completed: false,
            actionLabel: 'Send Portal Invite',
            onAction: noop,
          },
          {
            key: 'welcome_packet',
            label: 'Welcome packet sent',
            completed: false,
            actionLabel: 'Send Welcome Packet',
            onAction: noop,
          },
        ]}
      />
    </CardContent>
  </Card>
);

export const MoveOutCompleted = () => (
  <Card className="w-full">
    <CardHeader>
      <div className="flex items-center justify-between gap-4">
        <div>
          <CardTitle>Move-out checklist · Unit 402</CardTitle>
          <CardDescription>Lease #L-2025-0118 · closed 29 August 2026</CardDescription>
        </div>
        <ShadcnBadge variant="outline">Complete</ShadcnBadge>
      </div>
    </CardHeader>
    <CardContent>
      <ChecklistStepper
        disabled
        onStepToggle={noop}
        steps={[
          {
            key: 'notice_received',
            label: '30-day notice received',
            completed: true,
            completedBy: 'Rafael Mendes',
            completedAt: '2026-07-28T13:05:00Z',
          },
          {
            key: 'move_out_inspection_completed',
            label: 'Move-out inspection completed',
            completed: true,
            completedBy: 'Rafael Mendes',
            completedAt: '2026-08-26T18:10:00Z',
          },
          {
            key: 'deposit_disposition',
            label: 'Security deposit disposition calculated',
            completed: true,
            completedBy: 'Dana Whitfield',
            completedAt: '2026-08-28T16:45:00Z',
            autoCompleted: true,
          },
          {
            key: 'keys_returned',
            label: 'Keys/access cards returned',
            completed: true,
            completedBy: 'Rafael Mendes',
            completedAt: '2026-08-29T14:02:00Z',
          },
        ]}
      />
    </CardContent>
  </Card>
);
