import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { SignalProvider } from './types';

const ICP_MIN_UNITS = 25;
const ICP_MAX_UNITS = 149;

/** New leads: badge = status 'new'; tray = newest ICP-band leads (25–149 units). */
export const leadsSignals: SignalProvider = {
  key: 'leads',
  async load() {
    const db = createAdminTypedClient();
    const { data, count, error } = await db
      .from('marketing_leads')
      .select('id, association_name, unit_count, created_at', { count: 'exact' })
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(`leads signals: ${error.message}`);
    const icp = (data ?? []).filter((l) => l.unit_count !== null && l.unit_count >= ICP_MIN_UNITS && l.unit_count <= ICP_MAX_UNITS).slice(0, 3);
    return {
      count: count ?? 0,
      items: icp.map((l) => ({
        id: `lead-${l.id}`,
        tone: 'brand',
        icon: 'mail',
        title: `New lead in ICP: ${l.association_name ?? 'Unnamed association'} (${l.unit_count} units)`,
        meta: 'Compliance checker',
        href: '/leads?status=new',
        occurredAt: l.created_at,
      })),
    };
  },
};
