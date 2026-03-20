/**
 * Move checklist constants — safe for client-side import.
 * These are re-exported from the schema for server-side convenience,
 * but client components should import from '@propertypro/db/constants'.
 */

export type MoveChecklistType = 'move_in' | 'move_out';

export interface ChecklistStepData {
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  linkedEntityType?: 'esign_submission' | 'maintenance_request' | 'invitation';
  linkedEntityId?: number;
}

export type ChecklistData = Record<string, ChecklistStepData>;

export const MOVE_IN_STEPS = [
  'lease_signed',
  'security_deposit',
  'move_in_inspection',
  'keys_assigned',
  'parking_assigned',
  'portal_account',
  'welcome_packet',
  'utilities_confirmed',
] as const;

export const MOVE_OUT_STEPS = [
  'notice_received',
  'move_out_inspection_scheduled',
  'move_out_inspection_completed',
  'deposit_disposition',
  'keys_returned',
  'parking_cleared',
  'portal_deactivated',
  'deposit_refund',
] as const;

export const STEP_LABELS: Record<string, string> = {
  // Move-in
  lease_signed: 'Lease signed',
  security_deposit: 'Security deposit recorded',
  move_in_inspection: 'Move-in inspection scheduled',
  keys_assigned: 'Keys/access cards assigned',
  parking_assigned: 'Parking assigned',
  portal_account: 'Resident portal account created',
  welcome_packet: 'Welcome packet sent',
  utilities_confirmed: 'Utilities transfer confirmed',
  // Move-out
  notice_received: '30-day notice received',
  move_out_inspection_scheduled: 'Move-out inspection scheduled',
  move_out_inspection_completed: 'Move-out inspection completed',
  deposit_disposition: 'Security deposit disposition calculated',
  keys_returned: 'Keys/access cards returned',
  parking_cleared: 'Parking assignment cleared',
  portal_deactivated: 'Portal access deactivated',
  deposit_refund: 'Security deposit refund processed',
};

/** Steps that support integration actions (create inspection, send invite, send email). */
export const ACTIONABLE_STEPS: Record<string, { action: string; label: string }> = {
  move_in_inspection: { action: 'create_inspection', label: 'Schedule Inspection' },
  portal_account: { action: 'send_invite', label: 'Send Portal Invite' },
  welcome_packet: { action: 'send_welcome', label: 'Send Welcome Packet' },
  move_out_inspection_scheduled: { action: 'create_inspection', label: 'Schedule Inspection' },
};
