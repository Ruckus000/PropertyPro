import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import { format } from 'date-fns';
import type { SignalProvider } from './types';

/** Cooling-off deletion requests: count for the nav badge, soonest-ending 5 for the tray. */
export const deletionSignals: SignalProvider = {
  key: 'deletion',
  async load() {
    const db = createAdminTypedClient();
    const { data, count, error } = await db
      .from('account_deletion_requests')
      .select('id, request_type, cooling_ends_at, created_at', { count: 'exact' })
      .eq('status', 'cooling')
      .order('cooling_ends_at', { ascending: true })
      .limit(5);
    if (error) throw new Error(`deletion signals: ${error.message}`);
    return {
      count: count ?? 0,
      items: (data ?? []).map((r) => ({
        id: `deletion-${r.id}`,
        tone: 'warning',
        icon: 'trash',
        title: `${r.request_type === 'community' ? 'Community' : 'Account'} deletion cooling ends ${format(new Date(r.cooling_ends_at), 'MMM d')}`,
        meta: `Requested ${format(new Date(r.created_at), 'MMM d')}`,
        href: '/deletion-requests',
        occurredAt: r.created_at,
      })),
    };
  },
};
