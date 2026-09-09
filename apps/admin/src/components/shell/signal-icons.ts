import {
  Activity,
  Bug,
  Building2,
  CreditCard,
  Inbox,
  Mail,
  Ticket,
  Trash2,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { SignalIcon } from '@/lib/server/signals/types';

/**
 * Maps each `ShellSignalItem.icon` key to the Lucide icon the notification
 * tray renders for it. Kept as a literal record (not a switch/lookup built
 * from the string itself) so every icon referenced here is a real static
 * import — nothing assembled at runtime.
 */
export const SIGNAL_ICONS: Record<SignalIcon, LucideIcon> = {
  bug: Bug,
  creditCard: CreditCard,
  inbox: Inbox,
  trash: Trash2,
  mail: Mail,
  ticket: Ticket,
  activity: Activity,
  user: User,
  building: Building2,
};
