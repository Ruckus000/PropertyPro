/**
 * Leases v3 roster — shared UI contract between the page, the unit panel and
 * the dialogs. The page owns which dialog is open; each dialog owns its form
 * and calls one `LeaseActions` mutation, then reports back through `onDone`.
 */
import type { ResidentItem } from '@/hooks/use-leases';
import type { LeaseActions, LeaseSettings } from '@/hooks/use-lease-roster';
import type { PersonDirectory, RosterLease, UnitModel } from '@/lib/leases/roster-model';

export type RosterDialog =
  | { kind: 'lease'; mode: 'new' | 'edit'; unitId: number | null; leaseId?: number }
  | { kind: 'offer'; unitId: number }
  | { kind: 'offer-response'; unitId: number }
  | { kind: 'record-renewal'; unitId: number }
  | { kind: 'move-out'; unitId: number; mode: 'notice' | 'early' }
  | { kind: 'cancel-lease'; unitId: number; leaseId: number }
  | { kind: 'transfer'; unitId: number }
  | { kind: 'offline'; unitId: number }
  | { kind: 'deposit'; unitId: number; leaseId: number };

export interface RosterDialogProps {
  communityId: number;
  /** The unit the dialog acts on (null only for "New lease" with no unit picked yet). */
  model: UnitModel | null;
  /** Every unit — for pickers (New lease unit, Transfer destination). */
  models: UnitModel[];
  /** A specific lease when the action targets one that is not the current lease. */
  lease?: RosterLease | null;
  today: string;
  settings: LeaseSettings;
  actions: LeaseActions;
  directory: PersonDirectory;
  residents: ResidentItem[];
  /** Directory household members (no login); empty unless the community allows them on leases. */
  occupants: Array<{ id: number; unitId: number; fullName: string; email: string | null }>;
  /** Close and confirm. `undo`, when given, is offered on the confirmation toast. */
  onDone: (message: string, undo?: () => Promise<unknown>) => void;
  onClose: () => void;
  /** Open a help article by slug (Phase 3); a no-op until help ships. */
  onHelp?: (slug: string) => void;
}
