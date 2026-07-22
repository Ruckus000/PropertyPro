/**
 * Insurance policies + certificate requests (Wave 1 insurance hub, spec #3).
 *
 * `insurance_policies` is a per-community summary of the association's master
 * policy — carrier, limits, deductibles, dates — that owners view and download
 * for lender verification at a sale/refi (§718.111(12)(g) already requires the
 * policy posted). Coverage/deductible are FREE TEXT on purpose: dec pages
 * express limits heterogeneously (blanket limits, % hurricane deductibles,
 * sublimits) and structured cents columns would force lossy paraphrasing —
 * exactly the misrepresentation risk the legal review flagged.
 *
 * `insurance_certificate_requests` records an owner's "send my agent a
 * certificate request" relay. PropertyPro NEVER issues certificates (only the
 * licensed agent can, §626.854 public-adjuster line) — it relays a request.
 *
 * Insurance-hub features are compliance-community-only (hasInsuranceHub).
 * All queries through the scoped client (AGENTS #13).
 */
import { bigint, bigserial, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { documents } from './documents';
import { users } from './users';

/** Policy families a summary can describe (CHECK-constrained text). */
export const INSURANCE_POLICY_TYPES = [
  'property',
  'wind',
  'flood',
  'liability',
  'umbrella',
  'other',
] as const;
export type InsurancePolicyType = (typeof INSURANCE_POLICY_TYPES)[number];

/** Renewal-alert bands (persisted per row to dedupe cron alerts). */
export const INSURANCE_POLICY_ALERT_BANDS = ['60_days', '30_days', 'expired'] as const;
export type InsurancePolicyAlertBand = (typeof INSURANCE_POLICY_ALERT_BANDS)[number];

export const insurancePolicies = pgTable(
  'insurance_policies',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** See INSURANCE_POLICY_TYPES (CHECK-constrained). */
    policyType: text('policy_type').notNull(),
    carrierName: text('carrier_name').notNull(),
    /** Mildly sensitive — stripped for non-admin readers in the API handler. */
    policyNumber: text('policy_number'),
    /** Free text: limits as written on the declarations page. */
    coverageSummary: text('coverage_summary'),
    /** Free text incl. the hurricane deductible (often a % — do NOT model as cents). */
    deductibleSummary: text('deductible_summary'),
    effectiveAt: date('effective_at', { mode: 'string' }),
    expiresAt: date('expires_at', { mode: 'string' }).notNull(),
    agentName: text('agent_name'),
    /** Relay target for certificate requests. */
    agentEmail: text('agent_email'),
    agentPhone: text('agent_phone'),
    /** The posted policy / dec page in the document library. */
    documentId: bigint('document_id', { mode: 'number' }).references(() => documents.id, {
      onDelete: 'restrict',
    }),
    /** Last renewal-alert band emailed (cron dedupe). See INSURANCE_POLICY_ALERT_BANDS. */
    lastAlertBand: text('last_alert_band'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('insurance_policies_community_expires_idx').on(table.communityId, table.expiresAt),
  ],
);

/** Status of a certificate-request relay. */
export const CERTIFICATE_REQUEST_STATUSES = ['sent', 'failed'] as const;
export type CertificateRequestStatus = (typeof CERTIFICATE_REQUEST_STATUSES)[number];

export const insuranceCertificateRequests = pgTable(
  'insurance_certificate_requests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    policyId: bigint('policy_id', { mode: 'number' })
      .notNull()
      .references(() => insurancePolicies.id, { onDelete: 'cascade' }),
    /** The owner who requested it. RLS scopes non-admin reads to this column. */
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    unitLabel: text('unit_label').notNull(),
    /** Lender / title company. */
    recipientName: text('recipient_name').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    loanNumber: text('loan_number'),
    /** See CERTIFICATE_REQUEST_STATUSES (CHECK-constrained). */
    status: text('status').notNull().default('sent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('insurance_certificate_requests_community_idx').on(
      table.communityId,
      table.requestedBy,
    ),
  ],
);
