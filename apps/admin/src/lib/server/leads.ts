/**
 * Marketing leads data access for the admin console.
 *
 * Leads are platform-level (no community) and RLS-locked to service_role by
 * migration 0050, so this reads through the admin typed client like the other
 * platform-scoped admin surfaces.
 *
 * GTM context: docs/gtm/03-LAUNCH-READINESS.md item B1.
 */
import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { MarketingLeadRow } from '@propertypro/db/supabase/admin-types';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'disqualified';

export const LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'disqualified',
];

/** Known capture surfaces. `source` is a free-text column, so treat this as a display hint. */
export const SOURCE_LABELS: Record<string, string> = {
  compliance_checker: 'Compliance checker',
  pm_inquiry: 'Portfolio inquiry',
};

export function labelForSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

export interface AdminLead {
  id: number;
  email: string;
  associationName: string | null;
  contactName: string | null;
  associationType: string | null;
  unitCount: number | null;
  communityCount: number | null;
  message: string | null;
  obligationRequired: boolean | null;
  source: string;
  status: LeadStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Whether the lead falls in the ICP band defined in
   * docs/gtm/02-POSITIONING.md §1 (25–149 units). Computed here rather than
   * stored so a positioning change doesn't require a backfill.
   */
  inIcp: boolean;
}

export interface LeadFilters {
  status?: string | null;
  source?: string | null;
}

export interface LeadStats {
  total: number;
  new: number;
  inIcp: number;
  pmInquiries: number;
  last7Days: number;
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

/**
 * The ICP band is about a SINGLE self-managed association of 25–149 units.
 *
 * Gated on source because a PM inquiry's unit count is a portfolio total: a
 * 40-community management company reporting 120 units across them is not a
 * textbook ICP condo, and counting it as one puts noise in the number this
 * dashboard exists to surface.
 */
function isInIcp(row: MarketingLeadRow): boolean {
  if (row.source !== 'compliance_checker') return false;
  return row.unit_count !== null && row.unit_count >= 25 && row.unit_count <= 149;
}

function mapLead(row: MarketingLeadRow): AdminLead {
  return {
    id: row.id,
    email: row.email,
    associationName: row.association_name,
    contactName: row.contact_name,
    associationType: row.association_type,
    unitCount: row.unit_count,
    communityCount: row.community_count,
    message: row.message,
    obligationRequired:
      row.obligation_required === null ? null : row.obligation_required === 'true',
    source: row.source,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    inIcp: isInIcp(row),
  };
}

export async function getLeadsData(
  filters: LeadFilters = {},
): Promise<{ leads: AdminLead[]; stats: LeadStats }> {
  const db = createAdminTypedClient();

  let query = db
    .from('marketing_leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status as LeadStatus);
  }

  if (filters.source && filters.source !== 'all') {
    query = query.eq('source', filters.source);
  }

  const { data, error } = await query;
  throwIfError(error, 'Failed to load leads');

  const leads = ((data ?? []) as MarketingLeadRow[]).map(mapLead);

  // Stats describe the filtered set. The admin page always loads unfiltered on
  // first render, so the headline numbers are whole-pipeline by default.
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return {
    leads,
    stats: {
      total: leads.length,
      new: leads.filter((lead) => lead.status === 'new').length,
      inIcp: leads.filter((lead) => lead.inIcp).length,
      pmInquiries: leads.filter((lead) => lead.source === 'pm_inquiry').length,
      last7Days: leads.filter(
        (lead) => new Date(lead.createdAt).getTime() >= sevenDaysAgo,
      ).length,
    },
  };
}

export async function updateLead(
  id: number,
  updates: { status?: LeadStatus; notes?: string },
): Promise<void> {
  const db = createAdminTypedClient();

  const { error } = await db
    .from('marketing_leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  throwIfError(error, 'Failed to update lead');
}
