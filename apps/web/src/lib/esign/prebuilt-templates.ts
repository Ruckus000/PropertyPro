/**
 * Prebuilt e-sign template definitions.
 *
 * These are starter templates that can be provisioned for a community.
 * They define the default fields schema and signer roles for common
 * Florida condo/HOA document types.
 */

import type { EsignFieldsSchema, EsignTemplateType } from '@propertypro/shared';

export interface PrebuiltTemplate {
  /** Machine key */
  key: string;
  /** Display name */
  name: string;
  /** Template type from ESIGN_TEMPLATE_TYPES */
  templateType: EsignTemplateType;
  /** Short description shown in template gallery */
  description: string;
  /** Default fields schema — community can customize after provisioning */
  fieldsSchema: EsignFieldsSchema;
}

/**
 * Proxy Designation Form — used for owner proxy voting in condo/HOA
 * meetings per Florida Statute requirements.
 */
const PROXY_FORM: PrebuiltTemplate = {
  key: 'proxy_form',
  name: 'Proxy Designation Form',
  templateType: 'proxy',
  description:
    'Standard proxy form allowing unit owners to designate a voting representative for association meetings.',
  fieldsSchema: {
    version: 1,
    signerRoles: ['owner', 'proxy_holder'],
    fields: [
      {
        id: 'owner_name',
        type: 'text',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 25,
        width: 35,
        height: 4,
        required: true,
        label: 'Owner Name',
      },
      {
        id: 'owner_unit',
        type: 'text',
        signerRole: 'owner',
        page: 0,
        x: 55,
        y: 25,
        width: 20,
        height: 4,
        required: true,
        label: 'Unit Number',
      },
      {
        id: 'proxy_holder_name',
        type: 'text',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 35,
        width: 35,
        height: 4,
        required: true,
        label: 'Proxy Holder Name',
      },
      {
        id: 'meeting_date',
        type: 'date',
        signerRole: 'owner',
        page: 0,
        x: 55,
        y: 35,
        width: 20,
        height: 4,
        required: true,
        label: 'Meeting Date',
      },
      {
        id: 'owner_signature',
        type: 'signature',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 70,
        width: 35,
        height: 8,
        required: true,
        label: 'Owner Signature',
      },
      {
        id: 'owner_sign_date',
        type: 'date',
        signerRole: 'owner',
        page: 0,
        x: 55,
        y: 72,
        width: 20,
        height: 4,
        required: true,
        label: 'Date',
      },
      {
        id: 'proxy_holder_signature',
        type: 'signature',
        signerRole: 'proxy_holder',
        page: 0,
        x: 10,
        y: 82,
        width: 35,
        height: 8,
        required: true,
        label: 'Proxy Holder Signature',
      },
      {
        id: 'proxy_holder_sign_date',
        type: 'date',
        signerRole: 'proxy_holder',
        page: 0,
        x: 55,
        y: 84,
        width: 20,
        height: 4,
        required: true,
        label: 'Date',
      },
    ],
  },
};

/**
 * Violation Acknowledgment — used when a unit owner acknowledges receipt
 * of a violation notice and agrees to corrective action.
 */
const VIOLATION_ACK: PrebuiltTemplate = {
  key: 'violation_ack',
  name: 'Violation Acknowledgment',
  templateType: 'violation_ack',
  description:
    'Acknowledgment form for unit owners to confirm receipt of a violation notice and agree to corrective action.',
  fieldsSchema: {
    version: 1,
    signerRoles: ['owner'],
    fields: [
      {
        id: 'owner_name',
        type: 'text',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 20,
        width: 35,
        height: 4,
        required: true,
        label: 'Owner Name',
      },
      {
        id: 'owner_unit',
        type: 'text',
        signerRole: 'owner',
        page: 0,
        x: 55,
        y: 20,
        width: 20,
        height: 4,
        required: true,
        label: 'Unit Number',
      },
      {
        id: 'violation_description',
        type: 'text',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 32,
        width: 65,
        height: 4,
        required: false,
        label: 'Violation Description',
      },
      {
        id: 'corrective_deadline',
        type: 'date',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 42,
        width: 20,
        height: 4,
        required: true,
        label: 'Correction Deadline',
      },
      {
        id: 'acknowledge_checkbox',
        type: 'checkbox',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 55,
        width: 3,
        height: 3,
        required: true,
        label: 'I acknowledge receipt of this violation notice',
      },
      {
        id: 'agree_checkbox',
        type: 'checkbox',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 62,
        width: 3,
        height: 3,
        required: true,
        label: 'I agree to take corrective action by the deadline',
      },
      {
        id: 'owner_signature',
        type: 'signature',
        signerRole: 'owner',
        page: 0,
        x: 10,
        y: 75,
        width: 35,
        height: 8,
        required: true,
        label: 'Owner Signature',
      },
      {
        id: 'sign_date',
        type: 'date',
        signerRole: 'owner',
        page: 0,
        x: 55,
        y: 77,
        width: 20,
        height: 4,
        required: true,
        label: 'Date',
      },
    ],
  },
};

/**
 * All prebuilt templates keyed by their machine key.
 */
export const PREBUILT_TEMPLATES: Record<string, PrebuiltTemplate> = {
  proxy_form: PROXY_FORM,
  violation_ack: VIOLATION_ACK,
};

/**
 * Prebuilt templates as an array for iteration / display.
 */
export const PREBUILT_TEMPLATES_LIST: PrebuiltTemplate[] = Object.values(PREBUILT_TEMPLATES);
