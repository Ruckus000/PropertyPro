/**
 * Turns one audit log row into a plain-English sentence for a non-technical
 * manager: who did it, what they did, to what, and what changed.
 *
 * Pure (no database import), so the page, the side panel and the print view
 * all describe an entry the same way, server or client.
 *
 * Every member of `AuditAction` has a phrase: `ACTION_PHRASES` is a
 * `Record<AuditAction, …>`, so adding an action without a phrase fails to
 * compile. Strings that are not in the union (older rows, admin-console
 * actions) fall back to a readable version of the raw action name.
 */
import type { AuditAction } from '@propertypro/db';
import { isRoutineEntry, SUPPORT_METADATA_KEY } from './audit-catalog';
import { resourceKey, type AuditLogEntry, type AuditResourceInfo, type AuditScope } from './types';

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type AuditTone = 'danger' | 'warning' | 'info' | 'success';

export interface DescribedActor {
  /** `person` is a community member; `platform` is PropertyPro staff or an automatic job. */
  kind: 'person' | 'platform';
  name: string;
  userId: string | null;
  /** True when PropertyPro support made this change while signed in as `name`. */
  viaSupport: boolean;
}

export interface DescribedObject {
  label: string;
  /** Narrow the page to this person or item when clicked. Null when it can't be narrowed. */
  scope: AuditScope | null;
}

export interface FieldChange {
  label: string;
  /** Null when the field had no earlier value (a creation). */
  before: string | null;
  /** Null when the field has no later value (a deletion). */
  after: string | null;
}

export interface DescribedEvent {
  actor: DescribedActor;
  /** Text between the actor and the object, e.g. "deleted the document". */
  verb: string;
  object: DescribedObject | null;
  /** Text after the object, e.g. "to 214 people". */
  trailing: string | null;
  badge: { tone: AuditTone; label: string } | null;
  routine: boolean;
  changes: FieldChange[];
  note: { tone: AuditTone; text: string } | null;
  /** Whole sentence as plain text, for titles, aria labels and the print view. */
  sentence: string;
}

export interface DescribeContext {
  users: Record<string, string>;
  resources?: Record<string, AuditResourceInfo>;
  timeZone: string;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

interface ResourceSpec {
  /** Singular noun a manager would use, e.g. "document", "vendor". */
  noun: string;
  created?: string;
  updated?: string;
  deleted?: string;
  /** Search `entityType` for narrowing to this item (see SCOPE_RESOURCE_TYPES). */
  entityType?: string;
  /** For people-shaped resources, narrowing goes to the person instead. */
  personResource?: boolean;
}

const RESOURCES: Record<string, ResourceSpec> = {
  document: { noun: 'document', created: 'posted', entityType: 'document' },
  authored_document: { noun: 'document', created: 'published' },
  document_draft: { noun: 'document draft', created: 'started' },
  document_upload: { noun: 'file' },
  document_categories: { noun: 'document folder' },
  meeting: { noun: 'meeting', created: 'scheduled', entityType: 'meeting' },
  meeting_document: { noun: 'meeting document', updated: 'changed the documents for' },
  announcement: { noun: 'announcement', created: 'posted', entityType: 'announcement' },
  maintenance_request: { noun: 'maintenance request', created: 'submitted', entityType: 'maintenance' },
  maintenance_comment: { noun: 'comment on a maintenance request', created: 'added' },
  violation: { noun: 'violation', created: 'reported', entityType: 'violation' },
  violation_fine: { noun: 'fine', created: 'issued' },
  arc_submission: { noun: 'architectural request', created: 'submitted' },
  unit: { noun: 'unit' },
  unit_occupant: { noun: 'occupant' },
  resident: { noun: 'resident', personResource: true },
  user: { noun: 'member', personResource: true },
  invitation: { noun: 'invitation', personResource: true },
  lease: { noun: 'lease' },
  lease_deposit: { noun: 'deposit', created: 'recorded' },
  lease_renewal_offer: { noun: 'renewal offer', created: 'sent' },
  ledger_entry: { noun: 'ledger entry', created: 'recorded' },
  assessment: { noun: 'assessment' },
  assessment_line_item: { noun: 'charge' },
  assessment_line_item_batch: { noun: 'batch of charges', created: 'created' },
  rent_obligation: { noun: 'rent charge' },
  vendor: { noun: 'vendor' },
  work_order: { noun: 'work order', created: 'created' },
  amenity: { noun: 'amenity' },
  amenity_reservation: { noun: 'reservation', created: 'made' },
  contract: { noun: 'contract' },
  contract_bid: { noun: 'bid', created: 'recorded' },
  insurance_policy: { noun: 'insurance policy' },
  insurance_certificate_request: { noun: 'insurance certificate request', created: 'sent' },
  wind_mitigation_report: { noun: 'wind mitigation report' },
  reserve_asset: { noun: 'reserve item' },
  storm_damage_report: { noun: 'storm damage report', created: 'filed' },
  package_log: { noun: 'package', created: 'logged' },
  visitor_log: { noun: 'visitor', created: 'checked in' },
  denied_visitors: { noun: 'blocked visitor', created: 'blocked' },
  move_checklist: { noun: 'move-in/out checklist', created: 'started' },
  move_checklist_step: { noun: 'checklist step' },
  forum_thread: { noun: 'discussion', created: 'started' },
  forum_reply: { noun: 'reply', created: 'posted' },
  poll: { noun: 'poll', created: 'created' },
  poll_vote: { noun: 'poll vote', created: 'voted in' },
  compliance_checklist: { noun: 'compliance checklist', created: 'set up' },
  compliance_checklist_item: { noun: 'checklist item' },
  community: { noun: 'community' },
  communities: { noun: 'community' },
  community_profile: { noun: 'community profile' },
  community_settings: { noun: 'community settings' },
  community_lease_settings: { noun: 'lease settings' },
  community_branding: { noun: 'community branding' },
  community_site: { noun: 'website', updated: 'published changes to the' },
  community_site_drafts: { noun: 'website draft' },
  site_block: { noun: 'website section', updated: 'edited a', deleted: 'removed a' },
  site_page: { noun: 'website page' },
  site_look: { noun: 'website design', updated: 'changed the' },
  site_live_notice: { noun: 'website notice' },
  site_image: { noun: 'website photo', created: 'uploaded' },
  community_export_job: { noun: 'full records export', created: 'started' },
  stripe_connected_account: { noun: 'payment account', created: 'connected' },
  stripe_connect_oauth_start: { noun: 'payment account setup', created: 'started' },
  sms_consent: { noun: 'text message consent' },
  snowbird_digest_settings: { noun: 'seasonal digest settings' },
  onboarding_wizard: { noun: 'setup checklist', updated: 'saved progress on the' },
  account_deletion_request: { noun: 'deletion request' },
  esign_template: { noun: 'e-sign template' },
  esign_submission: { noun: 'signature request' },
  esign_signer: { noun: 'signer' },
  election: { noun: 'election' },
  emergency_broadcast: { noun: 'emergency alert' },
  faq: { noun: 'FAQ' },
  transparency: { noun: 'transparency page' },
  notification_preferences: { noun: 'notification preferences' },
  site_publish_schedule: { noun: 'website publishing schedule' },
  document_redaction_attestation: { noun: 'redaction confirmation', created: 'confirmed a' },
  document_publish_redaction_attestation: { noun: 'redaction confirmation', created: 'confirmed a' },
  invitation_failed: { noun: 'invitation that could not be sent', created: 'recorded an' },
};

function resourceSpec(resourceType: string): ResourceSpec {
  return RESOURCES[resourceType] ?? { noun: humanize(resourceType).toLowerCase() };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Ctx = DescribeContext;
type Fn<T> = (entry: AuditLogEntry, ctx: Ctx) => T;

interface PhraseSpec {
  /** Used when the object is known. */
  verb: string | Fn<string>;
  /** Used when it isn't; defaults to `verb`. */
  verbAlone?: string;
  /** What the bold object is. Default: the entry's item. */
  object?: 'item' | 'target' | 'none' | Fn<DescribedObject | null>;
  trailing?: Fn<string | null>;
  badge?: { tone: AuditTone; label: string };
  note?: Fn<{ tone: AuditTone; text: string } | null>;
  /** Never show field values (secret ballots). */
  hideChanges?: boolean;
}

const PERSONAL_DATA_NOTE = {
  tone: 'warning' as const,
  text: 'This file includes residents’ personal details. Share it only with people allowed to see official records.',
};

const ACTION_PHRASES: Record<AuditAction, PhraseSpec> = {
  // Generic create/update/delete phrases come from RESOURCES (see genericPhrase).
  create: { verb: 'added' },
  update: { verb: 'updated' },
  delete: { verb: 'deleted', badge: { tone: 'danger', label: 'Deleted' } },

  user_invited: { verb: 'invited', verbAlone: 'invited a new member', object: 'target' },
  settings_changed: {
    verb: (e) => {
      const noun = resourceSpec(e.resourceType).noun;
      return /(settings|preferences|schedule)$/.test(noun) ? `changed the ${noun}` : `changed the ${noun} settings`;
    },
    object: 'none',
  },
  meeting_notice_posted: {
    verb: 'posted the notice for',
    verbAlone: 'posted a meeting notice',
    trailing: (e, ctx) => noticeLeadTime(e, ctx),
  },
  meeting_minutes_approved: { verb: 'approved the minutes for', verbAlone: 'approved meeting minutes' },
  announcement_email_sent: {
    verb: 'emailed the announcement',
    verbAlone: 'emailed an announcement',
    trailing: (e) => recipients(e.metadata?.['recipientCount']),
  },
  document_deleted: { verb: 'deleted the document', verbAlone: 'deleted a document', badge: { tone: 'danger', label: 'Deleted' } },
  document_accessed: { verb: 'opened', verbAlone: 'opened a document' },
  validation_failed: { verb: 'tried to upload a file that was rejected', object: 'none' },
  notification_sent: {
    verb: (e) =>
      e.resourceType === 'document_posted'
        ? 'emailed owners about a newly posted document'
        : e.resourceType === 'meeting_notice'
          ? 'emailed a meeting notice'
          : 'sent an email notice',
    object: 'none',
    trailing: (e) => recipients(e.metadata?.['sentCount'] ?? e.metadata?.['recipientCount']),
  },
  notification_delivery_partial: {
    verb: 'could not deliver some emails about',
    verbAlone: 'could not deliver some emails',
    badge: { tone: 'warning', label: 'Not delivered' },
  },

  esign_template_created: { verb: 'created the e-sign template' , verbAlone: 'created an e-sign template' },
  esign_template_updated: { verb: 'edited the e-sign template', verbAlone: 'edited an e-sign template' },
  esign_template_archived: { verb: 'archived the e-sign template', verbAlone: 'archived an e-sign template' },
  esign_template_cloned: { verb: 'copied the e-sign template', verbAlone: 'copied an e-sign template' },
  esign_submission_created: { verb: 'sent a document for signature', object: 'none', trailing: (e) => signerCount(e) },
  esign_submission_completed: { verb: 'received every signature on a signature request', object: 'none' },
  esign_submission_cancelled: { verb: 'cancelled a signature request', object: 'none' },
  esign_reminder_sent: { verb: 'sent a signing reminder', object: 'none' },
  esign_document_verified: { verb: 'checked a signed document', object: 'none' },
  esign_consent_revoked: { verb: 'withdrew consent to sign electronically', object: 'none' },
  esign_source_document_imported: { verb: 'prepared for e-signing:', verbAlone: 'prepared a document for e-signing' },
  notice_consent_given: { verb: 'agreed to receive official notices by email', object: 'none' },
  notice_consent_withdrawn: { verb: 'stopped receiving official notices by email', object: 'none' },

  emergency_broadcast_created: { verb: 'drafted the emergency alert', verbAlone: 'drafted an emergency alert', object: titleFromMetadata },
  emergency_broadcast_sent: {
    verb: 'sent the emergency alert',
    verbAlone: 'sent an emergency alert',
    object: titleFromMetadata,
    trailing: (e) => recipients(e.metadata?.['recipientCount']),
  },
  emergency_broadcast_canceled: { verb: 'cancelled the emergency alert', verbAlone: 'cancelled an emergency alert', object: titleFromMetadata },

  election_created: { verb: 'created the election', verbAlone: 'created an election' },
  election_updated: { verb: 'edited the election', verbAlone: 'edited an election' },
  election_opened: { verb: 'opened voting for', verbAlone: 'opened voting in an election' },
  election_closed: { verb: 'closed voting for', verbAlone: 'closed voting in an election' },
  election_certified: { verb: 'certified the results of', verbAlone: 'certified election results' },
  election_canceled: { verb: 'cancelled the election', verbAlone: 'cancelled an election' },
  election_candidate_added: { verb: 'added a candidate to', verbAlone: 'added an election candidate' },
  election_candidate_removed: { verb: 'removed a candidate from', verbAlone: 'removed an election candidate' },
  election_eligibility_snapshotted: { verb: 'locked the voter list for', verbAlone: 'locked an election’s voter list' },
  ballot_cast: { verb: 'cast a ballot', object: 'none', hideChanges: true },
  proxy_designated: { verb: 'named a proxy voter', object: 'none', hideChanges: true },
  proxy_approved: { verb: 'approved a proxy', object: 'none', hideChanges: true },
  proxy_rejected: { verb: 'rejected a proxy', object: 'none', hideChanges: true },
  proxy_revoked: { verb: 'revoked a proxy', object: 'none', hideChanges: true },

  'faq.created': { verb: 'added the FAQ', verbAlone: 'added an FAQ', object: questionObject },
  'faq.updated': { verb: 'edited the FAQ', verbAlone: 'edited an FAQ', object: questionObject },
  'faq.deleted': { verb: 'deleted the FAQ', verbAlone: 'deleted an FAQ', object: questionObject, badge: { tone: 'danger', label: 'Deleted' } },
  'faq.reordered': { verb: 'reordered the FAQs', object: 'none' },
  'community.contact_updated': { verb: 'updated the community’s contact details', object: 'none' },
  'profile.updated': { verb: 'updated their profile', object: 'none' },
  'access_request.approved': { verb: 'approved an access request from', verbAlone: 'approved an access request', object: 'target' },
  'access_request.denied': { verb: 'denied an access request from', verbAlone: 'denied an access request', object: 'target' },
  'join_request.approved': { verb: 'approved a request to join from', verbAlone: 'approved a request to join', object: 'target' },
  'join_request.denied': { verb: 'denied a request to join from', verbAlone: 'denied a request to join', object: 'target' },

  community_export_downloaded: {
    verb: 'downloaded a full copy of the community’s records',
    object: 'none',
    badge: { tone: 'warning', label: 'Personal data' },
    note: () => PERSONAL_DATA_NOTE,
  },
  fining_committee_disclaimer_accepted: {
    verb: 'accepted the small fining committee warning',
    object: 'none',
    badge: { tone: 'warning', label: 'Risk accepted' },
    note: () => ({
      tone: 'warning',
      text: 'A fine was issued by a fining committee with fewer than three members after this person accepted the warning.',
    }),
  },
  directory_exported: {
    verb: (e) => `downloaded the ${e.resourceId === 'units' ? 'units' : 'residents'} directory`,
    object: 'none',
    trailing: (e) =>
      e.resourceId === 'units' ? count(e.metadata?.['rowCount'], 'unit') : count(e.metadata?.['rowCount'], 'person', 'people'),
    badge: { tone: 'warning', label: 'Personal data' },
    note: () => PERSONAL_DATA_NOTE,
  },
  audit_evidence_generated: {
    verb: 'printed the audit record for',
    verbAlone: 'printed an audit record',
    object: (e) => {
      const label = str(e.metadata?.['scopeLabel']);
      return label ? { label, scope: null } : null;
    },
    trailing: (e) => count(e.metadata?.['entryCount'], 'entry', 'entries'),
  },
  community_purged: {
    verb: 'permanently deleted the community’s data',
    object: 'none',
    badge: { tone: 'danger', label: 'Permanent' },
  },
  community_canceled: { verb: 'cancelled the community’s subscription', object: 'none', badge: { tone: 'danger', label: 'Cancelled' } },
  support_session_started: { verb: 'started a support session', object: 'none' },
  support_session_ended: { verb: 'ended a support session', object: 'none' },
  support_consent_granted: {
    verb: 'allowed PropertyPro support to sign in and help',
    object: 'none',
    badge: { tone: 'warning', label: 'Access' },
  },
  support_consent_revoked: { verb: 'turned off PropertyPro support access', object: 'none' },

  link_document: { verb: 'linked a document to the checklist item', verbAlone: 'linked a document to the compliance checklist', object: checklistObject },
  unlink_document: { verb: 'unlinked a document from the checklist item', verbAlone: 'unlinked a document from the compliance checklist', object: checklistObject },
  mark_not_applicable: { verb: 'marked as not applicable:', verbAlone: 'marked a checklist item as not applicable', object: checklistObject },
  mark_applicable: { verb: 'marked as applicable again:', verbAlone: 'marked a checklist item as applicable', object: checklistObject },

  custom_domain_set: { verb: 'connected the web address', verbAlone: 'connected a web address', object: domainObject },
  custom_domain_verified: { verb: 'verified the web address', verbAlone: 'verified a web address', object: domainObject },
  custom_domain_removed: { verb: 'disconnected the web address', verbAlone: 'disconnected a web address', object: domainObject },
  urgent_notice_set: { verb: 'posted an urgent notice on the website', object: 'none', badge: { tone: 'info', label: 'Public' } },
  urgent_notice_cleared: { verb: 'took down the urgent notice on the website', object: 'none' },
  site_settings_updated: { verb: 'changed the website settings', object: 'none' },
  site_footer_updated: { verb: 'changed the website footer', object: 'none' },
  site_design_draft_saved: { verb: 'saved a draft of the website design', object: 'none' },
  portfolio_template_created: { verb: 'created a portfolio template', object: 'none' },
  portfolio_template_renamed: { verb: 'renamed a portfolio template', object: 'none' },
  portfolio_template_deleted: { verb: 'deleted a portfolio template', object: 'none' },
  portfolio_template_applied: { verb: 'applied a portfolio template to the website', object: 'none' },

  root_pending_deletion: {
    verb: 'started closing their account as root manager',
    object: 'none',
    badge: { tone: 'warning', label: 'Access' },
  },
  root_pending_deletion_no_successor: {
    verb: 'started closing their account as root manager',
    object: 'none',
    badge: { tone: 'warning', label: 'Access' },
    note: () => ({
      tone: 'warning',
      text: 'No property manager is left to take over as root manager. Contact PropertyPro support to assign one.',
    }),
  },
  root_claimed: { verb: 'became the root manager', object: 'none', badge: { tone: 'warning', label: 'Access' } },
  root_claim_disputed: { verb: 'disputed the root manager claim', object: 'none', badge: { tone: 'warning', label: 'Access' } },
  root_reassigned: { verb: 'made', verbAlone: 'reassigned the root manager role', object: 'target', trailing: () => 'the root manager', badge: { tone: 'warning', label: 'Access' } },
  root_transferred: { verb: 'handed the root manager role to', verbAlone: 'handed over the root manager role', object: 'target', badge: { tone: 'warning', label: 'Access' } },
  role_assigned: {
    verb: 'made',
    verbAlone: 'gave someone a new role',
    object: 'target',
    trailing: (e) => `a ${roleLabel(e.newValues?.['role'])}`,
    badge: { tone: 'warning', label: 'Access' },
  },
  role_revoked: {
    verb: 'removed property manager access from',
    verbAlone: 'removed someone’s property manager access',
    object: 'target',
    badge: { tone: 'warning', label: 'Access' },
  },
  designation_set: {
    verb: 'made',
    verbAlone: 'gave someone a board seat',
    object: 'target',
    trailing: (e) => (e.newValues?.['designation'] === 'board_president' ? 'board president' : 'a board member'),
  },
  designation_cleared: { verb: 'removed', verbAlone: 'removed someone from the board', object: 'target', trailing: () => 'from the board' },

  data_repair: {
    verb: (e) => `corrected ${resourceSpec(e.resourceType).noun} records`,
    object: 'none',
    note: (e) => {
      const reason = str(e.metadata?.['reason']);
      return {
        tone: 'info',
        text: reason
          ? `PropertyPro corrected this directly in the database. Reason recorded: “${reason}”.`
          : 'PropertyPro corrected this directly in the database.',
      };
    },
  },
};

function phraseFor(action: string): PhraseSpec | null {
  return Object.prototype.hasOwnProperty.call(ACTION_PHRASES, action)
    ? ACTION_PHRASES[action as AuditAction]
    : null;
}

/** create/update/delete read differently per item ("posted the document", "added the vendor"). */
function genericVerb(action: 'create' | 'update' | 'delete', spec: ResourceSpec, hasObject: boolean): string {
  const base =
    action === 'create' ? spec.created ?? 'added' : action === 'update' ? spec.updated ?? 'updated' : spec.deleted ?? 'deleted';
  // Specs whose verb already carries its article ("edited a", "changed the")
  // read "edited a website section"; the rest get "the <noun>" or "a <noun>".
  if (/\s(a|an|the)$/.test(base)) return `${base} ${spec.noun}`;
  return hasObject ? `${base} the ${spec.noun}` : `${base} ${article(spec.noun)} ${spec.noun}`;
}

// ---------------------------------------------------------------------------
// describe
// ---------------------------------------------------------------------------

export interface DescribeOptions {
  /**
   * Describe the action without its object ("opened a document"), for a line
   * that stands for several entries about different items.
   */
  withoutObject?: boolean;
}

export function describeAuditEvent(
  entry: AuditLogEntry,
  ctx: DescribeContext,
  options: DescribeOptions = {},
): DescribedEvent {
  const actor = describeActor(entry, ctx);
  const phrase = phraseFor(entry.action);
  const spec = resourceSpec(entry.resourceType);
  const isGeneric = entry.action === 'create' || entry.action === 'update' || entry.action === 'delete';

  const object = options.withoutObject ? null : resolveObject(entry, ctx, phrase, spec);
  let verb: string;
  if (isGeneric) {
    verb = genericVerb(entry.action as 'create' | 'update' | 'delete', spec, object !== null);
  } else if (phrase) {
    const v = typeof phrase.verb === 'function' ? phrase.verb(entry, ctx) : phrase.verb;
    verb = object === null && phrase.verbAlone ? phrase.verbAlone : v;
  } else {
    verb = `did “${humanize(entry.action).toLowerCase()}”`;
  }

  // A generic update that only archived or soft-deleted something reads as such.
  if (entry.action === 'update' && entry.newValues?.['deletedAt'] && !entry.oldValues?.['deletedAt']) {
    verb = genericVerb('delete', spec, object !== null);
  }

  const trailing = phrase?.trailing ? phrase.trailing(entry, ctx) : null;
  let badge = phrase?.badge ?? null;
  if (entry.action === 'update' && entry.newValues?.['deletedAt'] && !entry.oldValues?.['deletedAt']) {
    badge = { tone: 'danger', label: 'Deleted' };
  }
  if (!badge && actor.viaSupport) badge = { tone: 'info', label: 'Support' };

  let note = phrase?.note ? phrase.note(entry, ctx) : null;
  if (!note && actor.viaSupport) {
    note = {
      tone: 'info',
      text: `PropertyPro support made this change while signed in as ${actor.name}, with your community’s permission.`,
    };
  }
  if (!note && isDeletion(entry) && entry.resourceType === 'document') {
    note = {
      tone: 'warning',
      text: 'If this was a record Florida law requires you to post, check your compliance checklist and upload it again.',
    };
  }

  const changes = phrase?.hideChanges ? [] : describeChanges(entry, ctx);
  const actorText = actor.viaSupport ? `PropertyPro support (signed in as ${actor.name})` : actor.name;
  const sentence = [actorText, verb, object?.label, trailing].filter(Boolean).join(' ');

  return {
    actor,
    verb,
    object,
    trailing,
    badge,
    routine: isRoutineEntry(entry),
    changes,
    note,
    sentence,
  };
}

function isDeletion(entry: AuditLogEntry): boolean {
  return entry.action === 'delete' || entry.action === 'document_deleted';
}

function describeActor(entry: AuditLogEntry, ctx: Ctx): DescribedActor {
  const viaSupport = Boolean(entry.metadata && SUPPORT_METADATA_KEY in entry.metadata);
  if (entry.userId === null) {
    return {
      kind: 'platform',
      name: entry.action === 'data_repair' ? 'PropertyPro support' : 'PropertyPro (automatic)',
      userId: null,
      viaSupport: false,
    };
  }
  const name = ctx.users[entry.userId];
  return {
    kind: 'person',
    // A member who has since left still has rows; never show a raw id.
    name: name ?? 'A former member',
    userId: entry.userId,
    viaSupport,
  };
}

function resolveObject(
  entry: AuditLogEntry,
  ctx: Ctx,
  phrase: PhraseSpec | null,
  spec: ResourceSpec,
): DescribedObject | null {
  const mode = phrase?.object ?? 'item';
  if (typeof mode === 'function') return mode(entry, ctx);
  if (mode === 'none') return null;
  if (mode === 'target' || spec.personResource) return targetPerson(entry, ctx);

  const label = itemName(entry, ctx);
  if (!label) return null;
  const scope: AuditScope | null = spec.entityType
    ? { kind: 'item', entityType: spec.entityType, resourceId: entry.resourceId }
    : null;
  return { label, scope };
}

/** The person an access change or invitation was about. */
function targetPerson(entry: AuditLogEntry, ctx: Ctx): DescribedObject | null {
  const candidates = [
    entry.newValues?.['userId'],
    entry.newValues?.['targetUserId'],
    entry.oldValues?.['userId'],
    entry.metadata?.['targetUserId'],
  ];
  const fromValues = candidates.find((v): v is string => typeof v === 'string' && v.length > 0);
  const userId = fromValues ?? (RESOURCES[entry.resourceType]?.personResource ? entry.resourceId : undefined);
  if (userId && ctx.users[userId]) {
    return { label: ctx.users[userId], scope: { kind: 'person', userId } };
  }
  const name = str(entry.newValues?.['fullName']) ?? str(entry.newValues?.['name']) ?? str(entry.oldValues?.['fullName']);
  return name ? { label: name, scope: null } : null;
}

/** An item's name: from the server's lookup first, then from what the row recorded. */
export function itemName(entry: AuditLogEntry, ctx: Ctx): string | null {
  const looked = ctx.resources?.[resourceKey(entry.resourceType, entry.resourceId)]?.name;
  if (looked) return looked;
  for (const source of [entry.newValues, entry.oldValues, entry.metadata]) {
    if (!source) continue;
    for (const key of ['title', 'name', 'fileName', 'documentTitle', 'itemTitle', 'label']) {
      const value = str(source[key]);
      if (value) return truncate(value, 80);
    }
    const unit = str(source['unitNumber']);
    if (unit) return `Unit ${unit}`;
  }
  return null;
}

function titleFromMetadata(entry: AuditLogEntry): DescribedObject | null {
  const title = str(entry.metadata?.['title']);
  return title ? { label: title, scope: null } : null;
}

function questionObject(entry: AuditLogEntry): DescribedObject | null {
  const q = str(entry.newValues?.['question']) ?? str(entry.oldValues?.['question']);
  return q ? { label: truncate(q, 80), scope: null } : null;
}

function checklistObject(entry: AuditLogEntry): DescribedObject | null {
  const title = str(entry.metadata?.['itemTitle']) ?? str(entry.newValues?.['itemTitle']);
  return title ? { label: title, scope: null } : null;
}

function domainObject(entry: AuditLogEntry): DescribedObject | null {
  const domain = str(entry.newValues?.['domain']) ?? str(entry.oldValues?.['domain']) ?? str(entry.newValues?.['customDomain']);
  return domain ? { label: domain, scope: null } : null;
}

function noticeLeadTime(entry: AuditLogEntry, ctx: Ctx): string | null {
  const startsAt = ctx.resources?.[resourceKey(entry.resourceType, entry.resourceId)]?.startsAt;
  const postedAt = str(entry.newValues?.['noticePostedAt']) ?? entry.createdAt;
  if (!startsAt) return null;
  const ms = Date.parse(startsAt) - Date.parse(postedAt);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = ms / 3_600_000;
  // A fact, not a legal judgment: how far ahead it went out.
  if (hours < 48) return `${Math.floor(hours)} hours before the meeting`;
  const days = Math.floor(hours / 24);
  return `${days} days before the meeting`;
}

function signerCount(entry: AuditLogEntry): string | null {
  return count(entry.newValues?.['signerCount'], 'signer');
}

// ---------------------------------------------------------------------------
// What changed
// ---------------------------------------------------------------------------

/** Keys that are plumbing, not something a manager decided. */
const HIDDEN_FIELD = /(^id$|Id$|_id$|^ids$|path|Path|hash|Hash|^createdAt$|^updatedAt$|^created_at$|^updated_at$|^createdBy$|^requestId$|^stepData$|^completionMarkers$|^externalId$|^docuseal|^support$|^sourceType$|^mimeType$|^signedDocumentPath$|^auditCertificatePath$)/;

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  name: 'Name',
  fileName: 'File name',
  fileSize: 'File size',
  status: 'Status',
  role: 'Role',
  designation: 'Board seat',
  audience: 'Who can see it',
  isPinned: 'Pinned',
  enabled: 'Turned on',
  archivedAt: 'Archived',
  deletedAt: 'Deleted',
  deleted_at: 'Deleted',
  noticePostedAt: 'Notice posted',
  startsAt: 'Starts',
  amountCents: 'Amount',
  effectiveDate: 'Date',
  dueDate: 'Due date',
  priority: 'Priority',
  category: 'Category',
  description: 'Description',
  notes: 'Notes',
  expiresAt: 'Expires',
  question: 'Question',
  answer: 'Answer',
  draftLook: 'Website design',
  lookId: 'Website design',
  isUnitOwner: 'Unit owner',
  email: 'Email',
  phone: 'Phone',
  unitNumber: 'Unit',
  site_published_at: 'Website published',
  unitCount: 'Units',
};

const ROLE_LABELS: Record<string, string> = {
  resident: 'resident',
  property_manager: 'property manager',
  root_manager: 'root manager',
  board_president: 'board president',
  board_member: 'board member',
};

function roleLabel(value: unknown): string {
  const raw = str(value);
  return raw ? ROLE_LABELS[raw] ?? humanize(raw).toLowerCase() : 'new role';
}

export function describeChanges(entry: AuditLogEntry, ctx: Ctx): FieldChange[] {
  const before = entry.oldValues ?? {};
  const after = entry.newValues ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const changes: FieldChange[] = [];
  for (const key of keys) {
    if (HIDDEN_FIELD.test(key)) continue;
    const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
    const b = hasBefore ? formatValue(key, before[key], ctx) : null;
    const a = hasAfter ? formatValue(key, after[key], ctx) : null;
    if (b === undefined || a === undefined) continue; // not displayable
    if (hasBefore && hasAfter && b === a) continue; // unchanged
    changes.push({ label: FIELD_LABELS[key] ?? humanize(key), before: b, after: a });
    if (changes.length >= 8) break;
  }
  return changes;
}

/** Returns `undefined` for values that can't be shown sensibly (nested objects). */
function formatValue(key: string, value: unknown, ctx: Ctx): string | null | undefined {
  if (value === null || value === undefined || value === '') {
    // A cleared timestamp ("deletedAt: null") reads as "No".
    return /At$|_at$/.test(key) ? 'No' : 'None';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (/cents$/i.test(key)) return formatMoney(value / 100);
    if (key === 'fileSize') return formatBytes(value);
    return value.toLocaleString('en-US');
  }
  if (typeof value === 'string') {
    if (key === 'role' || key === 'designation') return ROLE_LABELS[value] ? capitalize(ROLE_LABELS[value]) : humanize(value);
    if (/At$|_at$|Date$|^date$/.test(key) && !Number.isNaN(Date.parse(value))) {
      return /At$|_at$/.test(key) ? formatDateTime(value, ctx.timeZone) : formatDate(value, ctx.timeZone);
    }
    if (key === 'status' || key === 'audience' || key === 'priority') return humanize(value);
    return truncate(value, 140);
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) {
    return value.length === 0 ? 'None' : truncate(value.join(', '), 140);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** "Nov 1, 2026 at 9:02:41 AM EST" in the community's time zone. */
export function formatDateTime(iso: string, timeZone: string, withSeconds = false): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    timeZoneName: 'short',
  });
  return `${date} at ${time}`;
}

export function formatDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
}

/** "9:02 AM" in the community's time zone. */
export function formatTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
}

/** Calendar day key (YYYY-MM-DD) in the community's time zone. */
export function dayKey(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone });
}

/** "Today", "Yesterday", "Thursday, Oct 30", or "Oct 30, 2025" for another year. */
export function dayHeading(iso: string, timeZone: string, now: Date = new Date()): string {
  const key = dayKey(iso, timeZone);
  const today = dayKey(now.toISOString(), timeZone);
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000).toISOString(), timeZone);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const d = new Date(iso);
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  const sixDaysAgo = dayKey(new Date(now.getTime() - 6 * 86_400_000).toISOString(), timeZone);
  if (key >= sixDaysAgo) {
    return d.toLocaleDateString('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function count(value: unknown, singular: string, plural = `${singular}s`): string | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return `(${n.toLocaleString('en-US')} ${n === 1 ? singular : plural})`;
}

function recipients(value: unknown): string | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return `to ${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`;
}

export function humanize(raw: string): string {
  const words = raw
    .replace(/[._]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return capitalize(words);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function article(noun: string): string {
  return /^[aeiou]/i.test(noun) && !/^(user|unit|use)/i.test(noun) ? 'an' : 'a';
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatMoney(dollars: number): string {
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
