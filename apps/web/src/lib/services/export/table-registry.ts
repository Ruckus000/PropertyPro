/**
 * Declarative registry of what a full community export contains.
 *
 * ── Why every table declares its columns explicitly ──
 *
 * There is no `SELECT *` here, and there must never be. An export is a file the
 * association keeps forever and may hand to counsel, an auditor, or an owner
 * exercising §718.111(12)(c) records access. If it were built from `SELECT *`,
 * the next column anyone adds — a `search_vector`, an encrypted OAuth token, an
 * internal scoring field — would silently ship inside it. Explicit columns mean
 * adding a column is a deliberate decision, not an accident.
 *
 * ── Why exclusions are declared, not implied ──
 *
 * `INTENTIONALLY_EXCLUDED` names every tenant table that is deliberately absent,
 * with a reason. A test asserts that every entry in `RLS_TENANT_TABLES` appears
 * in exactly one of the two lists, so a table added later cannot quietly fall
 * out of the export. "We forgot" and "we decided not to" look identical in a
 * zip file; this makes them different in the source.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import {
  amenities,
  amenityReservations,
  announcements,
  arcSubmissions,
  assessmentLineItems,
  assessments,
  complianceAuditLog,
  complianceChecklistItems,
  contracts,
  documentCategories,
  documents,
  insurancePolicies,
  leases,
  ledgerEntries,
  maintenanceRequests,
  meetingDocuments,
  meetings,
  reserveAssets,
  units,
  userRoles,
  vendors,
  violationFines,
  violations,
  workOrders,
} from '@propertypro/db';
import type { PgTable } from '@propertypro/db';

export interface ExportColumn {
  /** Property name on the selected row. */
  key: string;
  /** Human-facing CSV header. */
  label: string;
  /** Drizzle column reference used to build the projection. */
  column: unknown;
}

export interface ExportTableSpec {
  /** Physical table name — must match an `RLS_TENANT_TABLES` entry. */
  tableName: string;
  /** Path inside the archive. */
  file: string;
  /** Drizzle table object. */
  table: PgTable;
  columns: ExportColumn[];
  /**
   * Human explanation of why a board needs this, surfaced in the archive README.
   * Writing it down forces the question "would a board actually want this?".
   */
  why: string;
}

function col(key: string, label: string, column: unknown): ExportColumn {
  return { key, label, column };
}

/** Columns every tenant row carries. Soft-deleted rows ARE exported (see below). */
function auditColumns(table: Record<string, unknown>): ExportColumn[] {
  return [
    col('createdAt', 'Created At', table.createdAt),
    col('updatedAt', 'Updated At', table.updatedAt),
    // deleted_at is EXPORTED, not filtered on.
    //
    // A soft-deleted meeting minute is still an association record under
    // §718.111(12)(b) — "we deleted it in the UI" is not the same as "it was
    // never a record". Excluding these rows would make the export something
    // other than the association's record set, which is the one thing it must
    // be. The column is present so the reader can tell the difference.
    col('deletedAt', 'Deleted At', table.deletedAt),
  ];
}

export const EXPORT_TABLES: ExportTableSpec[] = [
  {
    tableName: 'units',
    file: 'data/units.csv',
    table: units as PgTable,
    why: 'The property roster. Every other record keys off a unit.',
    columns: [
      col('id', 'ID', units.id),
      col('unitNumber', 'Unit Number', units.unitNumber),
      col('building', 'Building', units.building),
      col('floor', 'Floor', units.floor),
      col('sqft', 'Square Feet', units.sqft),
      col('bedrooms', 'Bedrooms', units.bedrooms),
      col('bathrooms', 'Bathrooms', units.bathrooms),
      ...auditColumns(units as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'user_roles',
    file: 'data/members.csv',
    table: userRoles as PgTable,
    why: 'Who held which role, and any board designation — needed to reconstruct who could act when.',
    columns: [
      col('id', 'ID', userRoles.id),
      col('userId', 'User ID', userRoles.userId),
      col('unitId', 'Unit ID', userRoles.unitId),
      col('role', 'Role', userRoles.role),
      col('designation', 'Board Designation', userRoles.designation),
      col('isUnitOwner', 'Is Unit Owner', userRoles.isUnitOwner),
      col('displayTitle', 'Display Title', userRoles.displayTitle),
      ...auditColumns(userRoles as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'meetings',
    file: 'data/meetings.csv',
    table: meetings as PgTable,
    why: 'Statutory notice and minutes record (§718.112). The most likely subject of a records request.',
    columns: [
      col('id', 'ID', meetings.id),
      col('title', 'Title', meetings.title),
      col('meetingType', 'Meeting Type', meetings.meetingType),
      col('startsAt', 'Starts At', meetings.startsAt),
      col('location', 'Location', meetings.location),
      col('endsAt', 'Ends At', meetings.endsAt),
      col('noticePostedAt', 'Notice Posted At', meetings.noticePostedAt),
      col('minutesApprovedAt', 'Minutes Approved At', meetings.minutesApprovedAt),
      ...auditColumns(meetings as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'meeting_documents',
    file: 'data/meeting-documents.csv',
    table: meetingDocuments as PgTable,
    why: 'Links minutes and packets to their meeting.',
    columns: [
      col('id', 'ID', meetingDocuments.id),
      col('meetingId', 'Meeting ID', meetingDocuments.meetingId),
      col('documentId', 'Document ID', meetingDocuments.documentId),
      ...auditColumns(meetingDocuments as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'documents',
    file: 'data/documents.csv',
    table: documents as PgTable,
    why: 'The document library index. `File Path` maps each row to its file inside documents/ in this archive.',
    columns: [
      col('id', 'ID', documents.id),
      col('title', 'Title', documents.title),
      col('description', 'Description', documents.description),
      col('categoryId', 'Category ID', documents.categoryId),
      col('fileName', 'File Name', documents.fileName),
      col('fileSize', 'File Size (bytes)', documents.fileSize),
      col('mimeType', 'MIME Type', documents.mimeType),
      // Included here but NOT in the legacy sync export, which deliberately
      // omitted it. In this archive the bytes travel alongside, so the path is
      // what lets a reader match a CSV row to its file.
      col('filePath', 'File Path', documents.filePath),
      ...auditColumns(documents as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'document_categories',
    file: 'data/document-categories.csv',
    table: documentCategories as PgTable,
    why: 'Resolves categoryId in documents.csv, including the statutory categories.',
    columns: [
      col('id', 'ID', documentCategories.id),
      col('name', 'Name', documentCategories.name),
      col('description', 'Description', documentCategories.description),
      col('isSystem', 'System Category', documentCategories.isSystem),
      ...auditColumns(documentCategories as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'compliance_checklist_items',
    file: 'data/compliance-checklist.csv',
    table: complianceChecklistItems as PgTable,
    why: 'The statutory obligation checklist and what satisfied each item.',
    columns: [
      col('id', 'ID', complianceChecklistItems.id),
      col('templateKey', 'Template Key', complianceChecklistItems.templateKey),
      col('title', 'Title', complianceChecklistItems.title),
      col('category', 'Category', complianceChecklistItems.category),
      col('statuteReference', 'Statute Reference', complianceChecklistItems.statuteReference),
      col('documentId', 'Linked Document ID', complianceChecklistItems.documentId),
      col('documentPostedAt', 'Document Posted At', complianceChecklistItems.documentPostedAt),
      col('deadline', 'Deadline', complianceChecklistItems.deadline),
      col('isApplicable', 'Applicable', complianceChecklistItems.isApplicable),
      ...auditColumns(complianceChecklistItems as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'compliance_audit_log',
    file: 'data/compliance-audit-log.csv',
    table: complianceAuditLog as PgTable,
    why: 'Append-only record of who changed what. The association\'s own evidence trail.',
    columns: [
      col('id', 'ID', complianceAuditLog.id),
      col('userId', 'Actor User ID', complianceAuditLog.userId),
      col('action', 'Action', complianceAuditLog.action),
      col('resourceType', 'Resource Type', complianceAuditLog.resourceType),
      col('resourceId', 'Resource ID', complianceAuditLog.resourceId),
      col('createdAt', 'Created At', complianceAuditLog.createdAt),
      // No oldValues/newValues: those blobs are already metadata-scrubbed on
      // read (see the audit-trail route) and can contain nested PII that the
      // scrubber only strips at the API layer. Exporting them raw would bypass
      // that. The action/resource pair is what reconstructs the trail.
    ],
  },
  {
    tableName: 'announcements',
    file: 'data/announcements.csv',
    table: announcements as PgTable,
    why: 'What the association told residents, and when.',
    columns: [
      col('id', 'ID', announcements.id),
      col('title', 'Title', announcements.title),
      col('body', 'Body', announcements.body),
      col('audience', 'Audience', announcements.audience),
      col('publishedAt', 'Published At', announcements.publishedAt),
      ...auditColumns(announcements as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'assessments',
    file: 'data/assessments.csv',
    table: assessments as PgTable,
    why: 'Assessment schedule — a financial record owners are entitled to inspect.',
    columns: [
      col('id', 'ID', assessments.id),
      col('title', 'Title', assessments.title),
      col('amountCents', 'Amount (cents)', assessments.amountCents),
      col('frequency', 'Frequency', assessments.frequency),
      col('dueDay', 'Due Day of Month', assessments.dueDay),
      col('startDate', 'Start Date', assessments.startDate),
      col('endDate', 'End Date', assessments.endDate),
      col('isActive', 'Active', assessments.isActive),
      ...auditColumns(assessments as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'assessment_line_items',
    file: 'data/assessment-line-items.csv',
    table: assessmentLineItems as PgTable,
    why: 'Per-unit assessment charges and their status.',
    columns: [
      col('id', 'ID', assessmentLineItems.id),
      col('assessmentId', 'Assessment ID', assessmentLineItems.assessmentId),
      col('unitId', 'Unit ID', assessmentLineItems.unitId),
      col('amountCents', 'Amount (cents)', assessmentLineItems.amountCents),
      col('lateFeeCents', 'Late Fee (cents)', assessmentLineItems.lateFeeCents),
      col('dueDate', 'Due Date', assessmentLineItems.dueDate),
      col('status', 'Status', assessmentLineItems.status),
      ...auditColumns(assessmentLineItems as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'ledger_entries',
    file: 'data/ledger.csv',
    table: ledgerEntries as PgTable,
    why: 'The general ledger. Without it the financial records are not reconstructable.',
    columns: [
      col('id', 'ID', ledgerEntries.id),
      col('unitId', 'Unit ID', ledgerEntries.unitId),
      col('entryType', 'Entry Type', ledgerEntries.entryType),
      col('amountCents', 'Amount (cents)', ledgerEntries.amountCents),
      col('description', 'Description', ledgerEntries.description),
      col('effectiveDate', 'Effective Date', ledgerEntries.effectiveDate),
      ...auditColumns(ledgerEntries as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'violations',
    file: 'data/violations.csv',
    table: violations as PgTable,
    why: 'Enforcement history — the record behind any selective-enforcement question.',
    columns: [
      col('id', 'ID', violations.id),
      col('unitId', 'Unit ID', violations.unitId),
      col('category', 'Category', violations.category),
      col('description', 'Description', violations.description),
      col('status', 'Status', violations.status),
      col('severity', 'Severity', violations.severity),
      col('noticeDate', 'Notice Date', violations.noticeDate),
      col('hearingDate', 'Hearing Date', violations.hearingDate),
      col('resolutionDate', 'Resolution Date', violations.resolutionDate),
      col('resolutionNotes', 'Resolution Notes', violations.resolutionNotes),
      ...auditColumns(violations as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'violation_fines',
    file: 'data/violation-fines.csv',
    table: violationFines as PgTable,
    why: 'Fines imposed, paid or waived — money owed by owners.',
    columns: [
      col('id', 'ID', violationFines.id),
      col('violationId', 'Violation ID', violationFines.violationId),
      col('amountCents', 'Amount (cents)', violationFines.amountCents),
      col('status', 'Status', violationFines.status),
      col('issuedAt', 'Issued At', violationFines.issuedAt),
      col('paidAt', 'Paid At', violationFines.paidAt),
      col('waivedAt', 'Waived At', violationFines.waivedAt),
      ...auditColumns(violationFines as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'arc_submissions',
    file: 'data/arc-submissions.csv',
    table: arcSubmissions as PgTable,
    why: 'Architectural review applications and the written reasons for each decision (§720.3035).',
    columns: [
      col('id', 'ID', arcSubmissions.id),
      col('unitId', 'Unit ID', arcSubmissions.unitId),
      col('title', 'Title', arcSubmissions.title),
      col('description', 'Description', arcSubmissions.description),
      col('projectType', 'Project Type', arcSubmissions.projectType),
      col('status', 'Status', arcSubmissions.status),
      col('reviewNotes', 'Review Notes', arcSubmissions.reviewNotes),
      // The statutory citation is the part of a denial that has to be
      // reproducible years later — exporting the prose without it would lose
      // exactly the field §720.3035 asks for.
      col('ruleReference', 'Rule Reference', arcSubmissions.ruleReference),
      col('decidedAt', 'Decided At', arcSubmissions.decidedAt),
      ...auditColumns(arcSubmissions as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'maintenance_requests',
    file: 'data/maintenance-requests.csv',
    table: maintenanceRequests as PgTable,
    why: 'Resident-reported issues and how the association responded.',
    columns: [
      col('id', 'ID', maintenanceRequests.id),
      col('unitId', 'Unit ID', maintenanceRequests.unitId),
      col('title', 'Title', maintenanceRequests.title),
      col('description', 'Description', maintenanceRequests.description),
      col('category', 'Category', maintenanceRequests.category),
      col('status', 'Status', maintenanceRequests.status),
      col('priority', 'Priority', maintenanceRequests.priority),
      col('resolutionDescription', 'Resolution', maintenanceRequests.resolutionDescription),
      col('resolutionDate', 'Resolution Date', maintenanceRequests.resolutionDate),
      // internalNotes deliberately omitted — staff-only commentary about a
      // resident, and an export is a document the association may hand out.
      ...auditColumns(maintenanceRequests as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'work_orders',
    file: 'data/work-orders.csv',
    table: workOrders as PgTable,
    why: 'Work performed on the property, and by whom.',
    columns: [
      col('id', 'ID', workOrders.id),
      col('title', 'Title', workOrders.title),
      col('description', 'Description', workOrders.description),
      col('status', 'Status', workOrders.status),
      col('unitId', 'Unit ID', workOrders.unitId),
      col('vendorId', 'Vendor ID', workOrders.vendorId),
      col('priority', 'Priority', workOrders.priority),
      col('completedAt', 'Completed At', workOrders.completedAt),
      ...auditColumns(workOrders as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'vendors',
    file: 'data/vendors.csv',
    table: vendors as PgTable,
    why: 'Vendor directory referenced by work orders and contracts.',
    columns: [
      col('id', 'ID', vendors.id),
      col('name', 'Name', vendors.name),
      col('company', 'Company', vendors.company),
      col('specialties', 'Specialties', vendors.specialties),
      col('email', 'Email', vendors.email),
      col('phone', 'Phone', vendors.phone),
      col('isActive', 'Active', vendors.isActive),
      ...auditColumns(vendors as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'contracts',
    file: 'data/contracts.csv',
    table: contracts as PgTable,
    why: 'Executory contracts — an enumerated §718.111(12)(g) website record.',
    columns: [
      col('id', 'ID', contracts.id),
      col('title', 'Title', contracts.title),
      col('vendorName', 'Vendor', contracts.vendorName),
      col('description', 'Description', contracts.description),
      col('contractValue', 'Contract Value', contracts.contractValue),
      col('startDate', 'Start Date', contracts.startDate),
      col('endDate', 'End Date', contracts.endDate),
      col('documentId', 'Document ID', contracts.documentId),
      // §718.3026 conflict-of-interest disclosure travels with the contract.
      col('conflictOfInterest', 'Conflict of Interest', contracts.conflictOfInterest),
      col('conflictOfInterestNote', 'Conflict Note', contracts.conflictOfInterestNote),
      ...auditColumns(contracts as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'insurance_policies',
    file: 'data/insurance-policies.csv',
    table: insurancePolicies as PgTable,
    why: 'Current insurance — an enumerated statutory record (§718.111(11)).',
    columns: [
      col('id', 'ID', insurancePolicies.id),
      col('policyType', 'Policy Type', insurancePolicies.policyType),
      col('carrierName', 'Carrier', insurancePolicies.carrierName),
      col('policyNumber', 'Policy Number', insurancePolicies.policyNumber),
      col('coverageSummary', 'Coverage Summary', insurancePolicies.coverageSummary),
      col('deductibleSummary', 'Deductible Summary', insurancePolicies.deductibleSummary),
      col('effectiveAt', 'Effective At', insurancePolicies.effectiveAt),
      col('expiresAt', 'Expires At', insurancePolicies.expiresAt),
      col('documentId', 'Document ID', insurancePolicies.documentId),
      ...auditColumns(insurancePolicies as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'reserve_assets',
    file: 'data/reserve-assets.csv',
    table: reserveAssets as PgTable,
    why: 'Reserve components underpinning SIRS and reserve transparency.',
    columns: [
      col('id', 'ID', reserveAssets.id),
      col('name', 'Name', reserveAssets.name),
      col('category', 'Category', reserveAssets.category),
      col('yearInstalled', 'Year Installed', reserveAssets.yearInstalled),
      col('usefulLifeYears', 'Useful Life (years)', reserveAssets.usefulLifeYears),
      col('replacementCostCents', 'Replacement Cost (cents)', reserveAssets.replacementCostCents),
      col('currentReserveCents', 'Current Reserve (cents)', reserveAssets.currentReserveCents),
      ...auditColumns(reserveAssets as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'leases',
    file: 'data/leases.csv',
    table: leases as PgTable,
    why: 'Lease records where the association tracks them.',
    columns: [
      col('id', 'ID', leases.id),
      col('unitId', 'Unit ID', leases.unitId),
      col('residentId', 'Resident User ID', leases.residentId),
      col('startDate', 'Start Date', leases.startDate),
      col('endDate', 'End Date', leases.endDate),
      col('status', 'Status', leases.status),
      ...auditColumns(leases as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'amenities',
    file: 'data/amenities.csv',
    table: amenities as PgTable,
    why: 'Shared facilities and their rules.',
    columns: [
      col('id', 'ID', amenities.id),
      col('name', 'Name', amenities.name),
      col('description', 'Description', amenities.description),
      col('location', 'Location', amenities.location),
      col('capacity', 'Capacity', amenities.capacity),
      col('isBookable', 'Bookable', amenities.isBookable),
      ...auditColumns(amenities as unknown as Record<string, unknown>),
    ],
  },
  {
    tableName: 'amenity_reservations',
    file: 'data/amenity-reservations.csv',
    table: amenityReservations as PgTable,
    why: 'Who reserved what — relevant to common-element use disputes.',
    columns: [
      col('id', 'ID', amenityReservations.id),
      col('amenityId', 'Amenity ID', amenityReservations.amenityId),
      col('unitId', 'Unit ID', amenityReservations.unitId),
      col('startTime', 'Start Time', amenityReservations.startTime),
      col('endTime', 'End Time', amenityReservations.endTime),
      col('status', 'Status', amenityReservations.status),
      ...auditColumns(amenityReservations as unknown as Record<string, unknown>),
    ],
  },
];

/**
 * Tenant tables deliberately NOT exported, each with a reason.
 *
 * Anything in `RLS_TENANT_TABLES` that appears in neither this map nor
 * `EXPORT_TABLES` fails the coverage test. That is the whole mechanism: a new
 * table forces an explicit decision instead of silently vanishing.
 */
export const INTENTIONALLY_EXCLUDED: Record<string, string> = {
  // ── Ballot secrecy ────────────────────────────────────────────────────────
  poll_votes: 'Ballot secrecy — exporting per-voter selections would defeat it in a single file.',
  election_ballots: 'Ballot secrecy (§718.128) — a ballot must not be tie-able to a specific unit owner.',
  election_ballot_submissions: 'Ballot secrecy — links a unit to a submission.',
  election_proxies: 'Ballot secrecy — reveals proxy relationships.',
  election_eligibility_snapshots: 'Ballot secrecy — voter eligibility roll.',
  election_candidates: 'Meaningful only alongside an election, which is excluded for ballot secrecy.',
  elections: 'Elections are gated off and ballot data is excluded; an election shell alone is misleading.',

  // ── Payment-processor state (not association records) ─────────────────────
  stripe_connected_accounts: 'Payment-processor linkage, not an association record. Contains Stripe account ids.',
  finance_stripe_webhook_events: 'Processor event journal — an internal idempotency log.',
  rent_obligations: 'Apartment rent ledger; belongs to the operator, not the association record set.',
  rent_payments: 'Apartment rent payments — belongs to the operator, not the association record set.',

  // ── Transient / operational queues ────────────────────────────────────────
  notification_digest_queue: 'Transient send queue. Empty between runs and meaningless once sent.',
  notifications: 'Per-user in-app notification feed — derived from records that are themselves exported.',
  notification_preferences: 'Per-user settings including SMS consent state — personal, not association, data.',
  calendar_event_reminder_log: 'Transient dedupe log preventing duplicate reminder sends; no record value.',
  calendar_sync_tokens: 'Google Calendar OAuth tokens. Exporting them would be a live credential leak.',
  accounting_connections: 'Third-party accounting OAuth credentials. Exporting them would be a credential leak.',
  announcement_delivery_log: 'Per-recipient delivery telemetry; the announcement itself is exported.',
  provisioning_jobs: 'Internal signup-provisioning state machine — PropertyPro operational state.',
  demo_seed_registry: 'Demo-data bookkeeping — tracks seeded fixtures, never present for a real association.',
  onboarding_wizard_state: 'Transient setup-wizard progress, meaningless once onboarding completes.',
  onboarding_checklist_items: 'Transient setup checklist, meaningless once onboarding completes.',
  conversion_events: 'PropertyPro product analytics about signup funnel behaviour — our data, not theirs.',

  // ── Support / platform access (ours, not theirs) ──────────────────────────
  support_consent_grants: 'Consent grants letting PropertyPro support view the account — our operational record.',
  support_access_log: 'PropertyPro support-access audit trail — our compliance record about our own staff.',
  root_claim_disputes: 'PropertyPro dispute-resolution workflow for contested community ownership — our process.',
  platform_admin_audit_log: 'Platform-admin actions across ALL tenants — cross-tenant, must never be exported.',

  // ── Website builder (regenerable presentation, not records) ───────────────
  site_blocks: 'Website page content blocks — presentation, regenerable, not a statutory record.',
  site_pages: 'Website page structure — presentation, regenerable, not a statutory record.',
  site_page_redirects: 'Website URL redirects — presentation routing, regenerable, not a statutory record.',
  site_publish_snapshots: 'Website publish history — versioning of presentation content, not a record.',
  document_drafts: 'In-progress unpublished drafts; the published documents themselves are exported.',

  // ── E-sign (separate custody chain) ───────────────────────────────────────
  esign_templates: 'E-sign templates — blank forms; the executed documents land in the document library.',
  esign_submissions: 'E-sign envelope state; executed documents are exported as documents.',
  esign_signers: 'E-sign signer PII tied to envelope state.',
  esign_events: 'E-sign envelope event log — signing-ceremony telemetry; the executed document is exported.',
  esign_consent: 'E-sign consent records tied to envelope state.',

  // ── Access / invitation workflow ──────────────────────────────────────────
  invitations: 'Contains live invitation TOKENS. Exporting them would be a credential leak.',
  access_requests: 'Pending access workflow, superseded by user_roles once granted.',
  community_join_requests: 'Pending join workflow, superseded by user_roles once granted.',

  // ── Comms and engagement ──────────────────────────────────────────────────
  emergency_broadcasts: 'Emergency alert history — operational, and recipient rows carry phone numbers.',
  emergency_broadcast_recipients: 'Per-recipient phone/delivery state.',
  forum_threads: 'Resident discussion — user-generated content, not an association record.',
  forum_replies: 'Resident discussion replies — user-generated content, not an association record.',
  faqs: 'Website FAQ content — presentation copy the association authored, not a statutory record.',
  help_article_feedback: 'Product feedback on OUR help articles.',
  help_article_views: 'Product analytics on OUR help articles.',
  snowbird_digest_subscriptions: 'Per-user digest preferences.',

  // ── Operational logs with resident PII, low record value ──────────────────
  package_log: 'Parcel receipt log — day-to-day operations with no statutory retention duty.',
  visitor_log: 'Visitor log — contains third-party PII with no statutory retention duty.',
  denied_visitors: 'Visitor deny-list — third-party PII with no statutory retention duty.',
  move_checklists: 'Move-in/out checklists — day-to-day operations with no statutory retention duty.',
  maintenance_comments: 'Comment threads on maintenance requests; the parent request itself is exported.',
  contract_bids: 'Bid records; contracts are exported. (Revisit — §718.111(12)(g) enumerates bids.)',
  insurance_certificate_requests: 'Owner certificate requests — a relay to the carrier, not an association record.',
  wind_mitigation_reports: 'Inspection reports; the PDF lands in the document library.',
  storm_damage_reports: 'Damage intake — operational, and the photos are exported as documents.',
  polls: 'Non-binding polls; vote rows are excluded for secrecy, so a poll shell alone would mislead.',

  // ── This feature itself ───────────────────────────────────────────────────
  community_export_jobs: 'Export bookkeeping. Exporting the export log is circular.',
  community_export_job_parts: 'Export bookkeeping — exporting the export log itself is circular.',
};
