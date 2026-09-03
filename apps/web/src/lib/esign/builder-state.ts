/**
 * The e-sign builder's state machine.
 *
 * One stepped flow serves every creation path, because they are the same act
 * with a different ending (design prototype `pp-esign-editor.js`):
 *
 *   Document → Recipients   → Place fields → Review & send    (one-off)
 *   Document → Signer roles → Place fields → Save template    (template)
 *
 * All of it lives here rather than in the component so the gating can be
 * tested without a DOM, and so both modes provably share one rule set.
 *
 * Fields address a RECIPIENT, not a role. Two recipients may share a role, and
 * a role may be renamed at any point, so a field that stored a role string
 * would silently follow the wrong person. The role is resolved once, at
 * `toFieldsSchema`, which is the only place the API's vocabulary is used.
 */
import type {
  EsignFieldDefinition,
  EsignFieldType,
  EsignFieldsSchema,
  EsignSigningOrder,
  EsignTemplateType,
} from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuilderMode = 'send' | 'template';
export type BuilderStep = 1 | 2 | 3 | 4;

export interface BuilderRecipient {
  /** Local only. Never sent; it is what fields point at while editing. */
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface BuilderField {
  id: string;
  recipientId: string;
  type: EsignFieldType;
  page: number;
  /** Percentages of the rendered page, matching `EsignFieldDefinition`. */
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  label?: string;
}

export interface BuilderDocument {
  /**
   * Path under `communities/{id}/esign-templates/`. Null while the file is
   * only on the author's disk — the upload happens once, at commit, so a
   * builder that is abandoned leaves nothing in storage.
   */
  sourceDocumentPath: string | null;
  name: string;
  /** Presigned URL, when the document is already in storage. */
  pdfUrl?: string | null;
  /** Raw bytes, when it was just picked from disk and not yet uploaded. */
  pdfData?: Uint8Array | null;
}

export interface BuilderState {
  mode: BuilderMode;
  step: BuilderStep;
  document: BuilderDocument | null;
  recipients: BuilderRecipient[];
  fields: BuilderField[];
  // Template mode
  templateName: string;
  templateType: EsignTemplateType;
  templateDescription: string;
  // Send mode
  signingOrder: EsignSigningOrder;
  /** Days from now; 0 means the request does not expire. */
  expiryDays: number;
  sendEmail: boolean;
  messageSubject: string;
  messageBody: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The route's own bound: `signers` is `.min(1).max(50)` in
 * `api/v1/esign/submissions/contract.ts`. Capping here means the builder
 * refuses before a send can fail.
 */
export const MAX_RECIPIENTS = 50;

/** Default field sizes as a percentage of the page, by type. */
export const DEFAULT_FIELD_SIZE: Record<EsignFieldType, { w: number; h: number }> = {
  signature: { w: 20, h: 5 },
  initials: { w: 10, h: 5 },
  date: { w: 15, h: 4 },
  text: { w: 25, h: 4 },
  checkbox: { w: 4, h: 4 },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newId(): string {
  return crypto.randomUUID();
}

function defaultRoleFor(index: number): string {
  return index === 0 ? 'owner' : `signer_${index + 1}`;
}

function blankRecipient(index: number): BuilderRecipient {
  return { id: newId(), name: '', email: '', role: defaultRoleFor(index) };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function createBuilderState(mode: BuilderMode): BuilderState {
  return {
    mode,
    step: 1,
    document: null,
    recipients: [blankRecipient(0)],
    fields: [],
    templateName: '',
    templateType: 'custom',
    templateDescription: '',
    signingOrder: 'parallel',
    expiryDays: 14,
    sendEmail: true,
    messageSubject: '',
    messageBody: '',
  };
}

// ---------------------------------------------------------------------------
// Recipients
// ---------------------------------------------------------------------------

export function addRecipient(state: BuilderState): BuilderState {
  if (state.recipients.length >= MAX_RECIPIENTS) {
    return state;
  }
  return {
    ...state,
    recipients: [...state.recipients, blankRecipient(state.recipients.length)],
  };
}

export function updateRecipient(
  state: BuilderState,
  recipientId: string,
  patch: Partial<Omit<BuilderRecipient, 'id'>>,
): BuilderState {
  return {
    ...state,
    recipients: state.recipients.map((r) =>
      r.id === recipientId ? { ...r, ...patch } : r,
    ),
  };
}

/** Removing a recipient removes their fields; the last one cannot be removed. */
export function removeRecipient(state: BuilderState, recipientId: string): BuilderState {
  if (state.recipients.length <= 1) {
    return state;
  }
  return {
    ...state,
    recipients: state.recipients.filter((r) => r.id !== recipientId),
    fields: state.fields.filter((f) => f.recipientId !== recipientId),
  };
}

export function fieldsForRecipient(state: BuilderState, recipientId: string): BuilderField[] {
  return state.fields.filter((f) => f.recipientId === recipientId);
}

export function recipientsWithoutFields(state: BuilderState): BuilderRecipient[] {
  return state.recipients.filter((r) => fieldsForRecipient(state, r.id).length === 0);
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

export interface PlaceFieldInput {
  recipientId: string;
  type: EsignFieldType;
  page: number;
  /** Where the author clicked, as a percentage of the page. */
  x: number;
  y: number;
}

/**
 * Places a field centred on the click and clamped inside the page. Without the
 * clamp a click near an edge produces a negative origin or a field running off
 * the page, which `validateFieldsSchema` rejects at save time — long after the
 * author has moved on.
 */
export function addField(state: BuilderState, input: PlaceFieldInput): BuilderState {
  const size = DEFAULT_FIELD_SIZE[input.type];
  const field: BuilderField = {
    id: newId(),
    recipientId: input.recipientId,
    type: input.type,
    page: input.page,
    x: Math.max(0, Math.min(100 - size.w, input.x - size.w / 2)),
    y: Math.max(0, Math.min(100 - size.h, input.y - size.h / 2)),
    width: size.w,
    height: size.h,
    required: true,
  };
  return { ...state, fields: [...state.fields, field] };
}

// ---------------------------------------------------------------------------
// The field editor speaks `EsignFieldDefinition`, whose `signerRole` this
// builder uses to carry the RECIPIENT id. These two adapters are the only
// places that translation happens.
// ---------------------------------------------------------------------------

export function toEditorFields(state: BuilderState): EsignFieldDefinition[] {
  return state.fields.map((f) => ({
    id: f.id,
    type: f.type,
    signerRole: f.recipientId,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
    ...(f.label === undefined ? {} : { label: f.label }),
  }));
}

export function fromEditorFields(
  state: BuilderState,
  next: EsignFieldDefinition[],
): BuilderState {
  return {
    ...state,
    fields: next.map((f) => ({
      id: f.id,
      recipientId: f.signerRole,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
      ...(f.label === undefined ? {} : { label: f.label }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

function recipientIsComplete(state: BuilderState, r: BuilderRecipient): boolean {
  if (state.mode === 'template') {
    // A template names roles, not people. Real signers are named when it is sent.
    return r.role.trim().length > 0;
  }
  return r.name.trim().length > 0 && EMAIL.test(r.email.trim()) && r.role.trim().length > 0;
}

function recipientsAreValid(state: BuilderState): boolean {
  return state.recipients.length > 0 && state.recipients.every((r) => recipientIsComplete(state, r));
}

function fieldsAreValid(state: BuilderState): boolean {
  return state.fields.length > 0 && recipientsWithoutFields(state).length === 0;
}

export function canReachStep(state: BuilderState, step: BuilderStep): boolean {
  if (step <= 1) return true;
  if (!state.document) return false;
  if (step <= 2) return true;
  if (!recipientsAreValid(state)) return false;
  if (step <= 3) return true;
  return fieldsAreValid(state);
}

/**
 * What is standing in the way, in the order the author will meet it. Returns
 * null when nothing is. A disabled Next button that says nothing is the most
 * common way a stepped form strands someone.
 */
export function gateReason(state: BuilderState): string | null {
  if (!state.document) {
    return 'Choose a document to continue.';
  }

  if (!recipientsAreValid(state)) {
    return state.mode === 'template'
      ? 'Give every signer a role name.'
      : 'Every recipient needs a name and an email address.';
  }

  if (state.fields.length === 0) {
    return 'Place at least one field on the document.';
  }

  const unfielded = recipientsWithoutFields(state);
  if (unfielded.length > 0) {
    const label = (r: BuilderRecipient, i: number) =>
      (state.mode === 'template' ? r.role : r.name.trim() || r.email.trim() || r.role) ||
      `Recipient ${i + 1}`;
    const names = unfielded.map(label).join(', ');
    return `${names} ${unfielded.length === 1 ? 'has' : 'have'} no field to fill in.`;
  }

  if (state.mode === 'template' && state.templateName.trim().length === 0) {
    return 'Name the template before saving it.';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** The field layout, in the API's own vocabulary. */
export function toFieldsSchema(state: BuilderState): EsignFieldsSchema {
  const roleOf = new Map(state.recipients.map((r) => [r.id, r.role.trim()]));

  const signerRoles: string[] = [];
  for (const r of state.recipients) {
    const role = r.role.trim();
    if (role && !signerRoles.includes(role)) {
      signerRoles.push(role);
    }
  }

  return {
    version: 1,
    signerRoles,
    fields: state.fields.map((f) => ({
      id: f.id,
      type: f.type,
      signerRole: roleOf.get(f.recipientId) ?? signerRoles[0] ?? 'owner',
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
      ...(f.label === undefined ? {} : { label: f.label }),
    })),
  };
}

/** The signer list a send needs, in the order the recipients were added. */
export function toSigners(state: BuilderState): Array<{
  email: string;
  name: string;
  role: string;
  sortOrder: number;
}> {
  return state.recipients.map((r, i) => ({
    email: r.email.trim(),
    name: r.name.trim(),
    role: r.role.trim(),
    sortOrder: i,
  }));
}

/** The absolute expiry a send carries, or undefined when it does not expire. */
export function toExpiresAt(state: BuilderState, now: Date = new Date()): string | undefined {
  if (state.expiryDays <= 0) return undefined;
  return new Date(now.getTime() + state.expiryDays * 24 * 60 * 60 * 1000).toISOString();
}
