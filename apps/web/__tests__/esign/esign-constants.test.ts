import { describe, expect, it } from 'vitest';
import {
  ESIGN_FIELD_TYPES,
  ESIGN_SIGNING_ORDERS,
  ESIGN_CONSENT_TEXT,
  ESIGN_MAX_REMINDERS,
  ESIGN_TEMPLATE_TYPES,
  ESIGN_TEMPLATE_STATUSES,
  ESIGN_SUBMISSION_STATUSES,
  ESIGN_SIGNER_STATUSES,
  ESIGN_EVENT_TYPES,
  ESIGN_ELEVATED_ROLES,
  ESIGN_REMINDER_INTERVALS_DAYS,
} from '@propertypro/shared';

describe('e-sign constants', () => {
  describe('ESIGN_FIELD_TYPES', () => {
    it('includes all expected field types', () => {
      expect(ESIGN_FIELD_TYPES).toContain('signature');
      expect(ESIGN_FIELD_TYPES).toContain('initials');
      expect(ESIGN_FIELD_TYPES).toContain('date');
      expect(ESIGN_FIELD_TYPES).toContain('text');
      expect(ESIGN_FIELD_TYPES).toContain('checkbox');
    });

    it('has exactly 5 field types', () => {
      expect(ESIGN_FIELD_TYPES).toHaveLength(5);
    });
  });

  describe('ESIGN_SIGNING_ORDERS', () => {
    it('includes parallel and sequential', () => {
      expect(ESIGN_SIGNING_ORDERS).toContain('parallel');
      expect(ESIGN_SIGNING_ORDERS).toContain('sequential');
    });

    it('has exactly 2 signing orders', () => {
      expect(ESIGN_SIGNING_ORDERS).toHaveLength(2);
    });
  });

  describe('ESIGN_CONSENT_TEXT', () => {
    it('is a non-empty string', () => {
      expect(ESIGN_CONSENT_TEXT).toBeTruthy();
      expect(typeof ESIGN_CONSENT_TEXT).toBe('string');
      expect(ESIGN_CONSENT_TEXT.length).toBeGreaterThan(0);
    });

    it('references UETA / Florida Statute', () => {
      expect(ESIGN_CONSENT_TEXT).toContain('Uniform Electronic Transaction Act');
      expect(ESIGN_CONSENT_TEXT).toContain('668.50');
      expect(ESIGN_CONSENT_TEXT).toContain('Florida Statutes');
    });

    it('references the federal ESIGN Act', () => {
      expect(ESIGN_CONSENT_TEXT).toContain('ESIGN Act');
    });

    it('mentions the right to withdraw consent', () => {
      expect(ESIGN_CONSENT_TEXT).toContain('withdraw this consent');
    });
  });

  describe('ESIGN_MAX_REMINDERS', () => {
    it('equals 3', () => {
      expect(ESIGN_MAX_REMINDERS).toBe(3);
    });

    it('is a positive integer', () => {
      expect(Number.isInteger(ESIGN_MAX_REMINDERS)).toBe(true);
      expect(ESIGN_MAX_REMINDERS).toBeGreaterThan(0);
    });
  });

  describe('ESIGN_TEMPLATE_TYPES', () => {
    it('includes all expected template types', () => {
      const expected = [
        'proxy',
        'consent',
        'lease_addendum',
        'maintenance_auth',
        'violation_ack',
        'assessment_agreement',
        'custom',
      ];
      for (const t of expected) {
        expect(ESIGN_TEMPLATE_TYPES).toContain(t);
      }
    });
  });

  describe('ESIGN_TEMPLATE_STATUSES', () => {
    it('includes active and archived', () => {
      expect(ESIGN_TEMPLATE_STATUSES).toContain('active');
      expect(ESIGN_TEMPLATE_STATUSES).toContain('archived');
    });
  });

  describe('ESIGN_SUBMISSION_STATUSES', () => {
    it('includes all lifecycle statuses', () => {
      expect(ESIGN_SUBMISSION_STATUSES).toContain('pending');
      expect(ESIGN_SUBMISSION_STATUSES).toContain('processing');
      expect(ESIGN_SUBMISSION_STATUSES).toContain('completed');
      expect(ESIGN_SUBMISSION_STATUSES).toContain('processing_failed');
      expect(ESIGN_SUBMISSION_STATUSES).toContain('declined');
      expect(ESIGN_SUBMISSION_STATUSES).toContain('expired');
      expect(ESIGN_SUBMISSION_STATUSES).toContain('cancelled');
    });
  });

  describe('ESIGN_SIGNER_STATUSES', () => {
    it('includes all signer lifecycle statuses', () => {
      expect(ESIGN_SIGNER_STATUSES).toContain('pending');
      expect(ESIGN_SIGNER_STATUSES).toContain('opened');
      expect(ESIGN_SIGNER_STATUSES).toContain('completed');
      expect(ESIGN_SIGNER_STATUSES).toContain('declined');
    });
  });

  describe('ESIGN_EVENT_TYPES', () => {
    it('includes core event types', () => {
      const coreEvents = [
        'created',
        'sent',
        'opened',
        'signed',
        'completed',
        'declined',
        'expired',
        'cancelled',
        'reminder_sent',
        'consent_given',
        'consent_revoked',
        'verified',
        'downloaded',
        'signer_completed',
        'submission_completed',
        'submission_processing_failed',
      ];
      for (const e of coreEvents) {
        expect(ESIGN_EVENT_TYPES).toContain(e);
      }
    });
  });

  describe('ESIGN_ELEVATED_ROLES', () => {
    it('includes management roles', () => {
      expect(ESIGN_ELEVATED_ROLES).toContain('board_member');
      expect(ESIGN_ELEVATED_ROLES).toContain('board_president');
      expect(ESIGN_ELEVATED_ROLES).toContain('cam');
      expect(ESIGN_ELEVATED_ROLES).toContain('property_manager_admin');
    });

    it('does not include owner or tenant', () => {
      expect(ESIGN_ELEVATED_ROLES).not.toContain('owner');
      expect(ESIGN_ELEVATED_ROLES).not.toContain('tenant');
    });
  });

  describe('ESIGN_REMINDER_INTERVALS_DAYS', () => {
    it('has values matching ESIGN_MAX_REMINDERS count', () => {
      expect(ESIGN_REMINDER_INTERVALS_DAYS).toHaveLength(ESIGN_MAX_REMINDERS);
    });

    it('contains only positive integers', () => {
      for (const interval of ESIGN_REMINDER_INTERVALS_DAYS) {
        expect(interval).toBeGreaterThan(0);
        expect(Number.isInteger(interval)).toBe(true);
      }
    });
  });
});
