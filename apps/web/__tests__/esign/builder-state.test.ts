/**
 * The e-sign builder's state machine.
 *
 * One stepped flow serves every creation path, because they are the same act
 * with a different ending (design prototype `pp-esign-editor.js`):
 *
 *   Document → Recipients   → Place fields → Review & send    (one-off)
 *   Document → Signer roles → Place fields → Save template    (template)
 *
 * The gating lives here rather than in the component so it can be tested
 * without a DOM, and so both modes provably share one rule set.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_RECIPIENTS,
  addField,
  addRecipient,
  canReachStep,
  createBuilderState,
  fieldsForRecipient,
  gateReason,
  recipientsWithoutFields,
  removeRecipient,
  toFieldsSchema,
  updateRecipient,
  type BuilderState,
} from '@/lib/esign/builder-state';

const DOC = {
  sourceDocumentPath: 'communities/1/esign-templates/abc-proxy.pdf',
  name: 'Limited proxy.pdf',
  pdfUrl: 'https://signed.example/proxy.pdf',
};

/** A send-mode state with a document and one complete recipient. */
function sendWithRecipient() {
  let s = createBuilderState('send');
  s = { ...s, document: DOC };
  s = updateRecipient(s, s.recipients[0]!.id, { name: 'Alice Owner', email: 'alice@test.com' });
  return s;
}

describe('createBuilderState', () => {
  it('starts a send on step 1 with one blank recipient', () => {
    const s = createBuilderState('send');
    expect(s.mode).toBe('send');
    expect(s.step).toBe(1);
    expect(s.document).toBeNull();
    expect(s.recipients).toHaveLength(1);
    expect(s.recipients[0]).toMatchObject({ name: '', email: '' });
  });

  it('starts a template with one signer role and no delivery settings to fill in', () => {
    const s = createBuilderState('template');
    expect(s.mode).toBe('template');
    expect(s.recipients).toHaveLength(1);
    expect(s.recipients[0]!.role).toBe('owner');
  });
});

describe('canReachStep', () => {
  it('always allows step 1', () => {
    expect(canReachStep(createBuilderState('send'), 1)).toBe(true);
  });

  it('refuses the recipients step until a document is chosen', () => {
    const s = createBuilderState('send');
    expect(canReachStep(s, 2)).toBe(false);
    expect(canReachStep({ ...s, document: DOC }, 2)).toBe(true);
  });

  it('refuses field placement until every recipient has a name and a real email', () => {
    let s: BuilderState = { ...createBuilderState('send'), document: DOC };
    expect(canReachStep(s, 3)).toBe(false);

    s = updateRecipient(s, s.recipients[0]!.id, { name: 'Alice Owner', email: 'not-an-email' });
    expect(canReachStep(s, 3)).toBe(false);

    s = updateRecipient(s, s.recipients[0]!.id, { email: 'alice@test.com' });
    expect(canReachStep(s, 3)).toBe(true);
  });

  it('a template needs only a role, never a name or an email', () => {
    // Real people are named when the template is sent.
    let s: BuilderState = { ...createBuilderState('template'), document: DOC };
    expect(canReachStep(s, 3)).toBe(true);

    s = updateRecipient(s, s.recipients[0]!.id, { role: '  ' });
    expect(canReachStep(s, 3)).toBe(false);
  });

  it('refuses review until at least one field is placed', () => {
    const s = sendWithRecipient();
    expect(canReachStep(s, 4)).toBe(false);
  });

  it('refuses review while any recipient has no field of their own', () => {
    // A signer with no field cannot sign, and the request would strand them.
    let s = sendWithRecipient();
    s = addRecipient(s);
    s = updateRecipient(s, s.recipients[1]!.id, { name: 'Wendy Witness', email: 'w@test.com' });
    s = addField(s, { recipientId: s.recipients[0]!.id, type: 'signature', page: 0, x: 10, y: 10 });

    expect(recipientsWithoutFields(s).map((r) => r.name)).toEqual(['Wendy Witness']);
    expect(canReachStep(s, 4)).toBe(false);

    s = addField(s, { recipientId: s.recipients[1]!.id, type: 'signature', page: 0, x: 10, y: 40 });
    expect(canReachStep(s, 4)).toBe(true);
  });

  it('a later step being reachable implies every earlier one is', () => {
    let s = sendWithRecipient();
    s = addField(s, { recipientId: s.recipients[0]!.id, type: 'signature', page: 0, x: 10, y: 10 });
    expect([1, 2, 3, 4].map((n) => canReachStep(s, n as 1 | 2 | 3 | 4))).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('gateReason', () => {
  it('says what is missing rather than only disabling the button', () => {
    const blank = createBuilderState('send');
    expect(gateReason(blank)).toMatch(/document/i);

    const withDoc = { ...blank, document: DOC };
    expect(gateReason(withDoc)).toMatch(/name and an email/i);

    const templateDoc = { ...createBuilderState('template'), document: DOC };
    expect(gateReason({ ...templateDoc, step: 3 })).toMatch(/at least one field/i);
  });

  it('names the recipients who still have no field', () => {
    let s = sendWithRecipient();
    s = { ...s, step: 3 };
    s = addRecipient(s);
    s = updateRecipient(s, s.recipients[1]!.id, { name: 'Wendy Witness', email: 'w@test.com' });
    s = addField(s, { recipientId: s.recipients[0]!.id, type: 'signature', page: 0, x: 10, y: 10 });

    expect(gateReason(s)).toContain('Wendy Witness');
  });
});

describe('recipients', () => {
  it('caps recipients at the route’s own signer limit', () => {
    let s = createBuilderState('send');
    for (let i = s.recipients.length; i < MAX_RECIPIENTS; i += 1) {
      s = addRecipient(s);
    }
    expect(s.recipients).toHaveLength(MAX_RECIPIENTS);

    const overflowed = addRecipient(s);
    expect(overflowed.recipients).toHaveLength(MAX_RECIPIENTS);
    expect(overflowed).toBe(s);
  });

  it('removing a recipient takes their fields with them', () => {
    let s = sendWithRecipient();
    s = addRecipient(s);
    const [first, second] = s.recipients;
    s = addField(s, { recipientId: first!.id, type: 'signature', page: 0, x: 10, y: 10 });
    s = addField(s, { recipientId: second!.id, type: 'date', page: 0, x: 50, y: 10 });

    s = removeRecipient(s, second!.id);

    expect(s.recipients).toHaveLength(1);
    expect(s.fields).toHaveLength(1);
    expect(fieldsForRecipient(s, first!.id)).toHaveLength(1);
  });

  it('never removes the last recipient', () => {
    const s = sendWithRecipient();
    expect(removeRecipient(s, s.recipients[0]!.id).recipients).toHaveLength(1);
  });
});

describe('addField', () => {
  it('centres the field on the click and keeps it inside the page', () => {
    let s = sendWithRecipient();
    // A signature defaults to 20 wide, so a click at x=5 would start at -5.
    s = addField(s, { recipientId: s.recipients[0]!.id, type: 'signature', page: 0, x: 5, y: 2 });

    const f = s.fields[0]!;
    expect(f.x).toBe(0);
    expect(f.y).toBe(0);
    expect(f.x + f.width).toBeLessThanOrEqual(100);
  });

  it('clamps a field placed against the far edge', () => {
    let s = sendWithRecipient();
    s = addField(s, { recipientId: s.recipients[0]!.id, type: 'signature', page: 1, x: 99, y: 99 });

    const f = s.fields[0]!;
    expect(f.x + f.width).toBeLessThanOrEqual(100);
    expect(f.y + f.height).toBeLessThanOrEqual(100);
    expect(f.page).toBe(1);
  });
});

describe('toFieldsSchema', () => {
  it('addresses fields by signer ROLE, which is what the API stores', () => {
    let s = sendWithRecipient();
    s = updateRecipient(s, s.recipients[0]!.id, { role: 'owner' });
    s = addRecipient(s);
    s = updateRecipient(s, s.recipients[1]!.id, {
      name: 'Wendy',
      email: 'w@test.com',
      role: 'witness',
    });
    s = addField(s, { recipientId: s.recipients[0]!.id, type: 'signature', page: 0, x: 10, y: 10 });
    s = addField(s, { recipientId: s.recipients[1]!.id, type: 'date', page: 0, x: 10, y: 40 });

    const schema = toFieldsSchema(s);

    expect(schema.version).toBe(1);
    expect(schema.signerRoles).toEqual(['owner', 'witness']);
    expect(schema.fields.map((f) => f.signerRole)).toEqual(['owner', 'witness']);
    // Every field's role must be one the schema declares, or the API rejects it.
    for (const f of schema.fields) {
      expect(schema.signerRoles).toContain(f.signerRole);
    }
  });

  it('gives two recipients sharing a role one entry, not two', () => {
    let s = sendWithRecipient();
    s = updateRecipient(s, s.recipients[0]!.id, { role: 'owner' });
    s = addRecipient(s);
    s = updateRecipient(s, s.recipients[1]!.id, {
      name: 'Bob',
      email: 'b@test.com',
      role: 'owner',
    });
    s = addField(s, { recipientId: s.recipients[0]!.id, type: 'signature', page: 0, x: 10, y: 10 });

    expect(toFieldsSchema(s).signerRoles).toEqual(['owner']);
  });
});
