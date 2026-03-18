/**
 * Phone number utilities for SMS integration.
 *
 * All phone numbers are stored and transmitted in E.164 format (+1XXXXXXXXXX).
 * This module provides normalization, validation, masking (for audit logs),
 * and display formatting.
 *
 * Scope: US phone numbers only (+1 country code). PropertyPro is a
 * Florida-focused platform — no international support needed.
 */
import { z } from 'zod';

// ── Constants ────────────────────────────────────────────────────────────────

/** US country code */
const US_COUNTRY_CODE = '+1';

/** E.164 pattern for US numbers: +1 followed by exactly 10 digits */
const E164_US_REGEX = /^\+1\d{10}$/;

/**
 * Strips everything except digits from a raw phone string.
 * Allows a leading '+' to pass through for already-formatted numbers.
 */
const DIGIT_ONLY_REGEX = /[^\d]/g;

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Normalize a raw phone input to E.164 format (+1XXXXXXXXXX).
 *
 * Handles common US input formats:
 *   "(305) 555-1234"  → "+13055551234"
 *   "305-555-1234"    → "+13055551234"
 *   "3055551234"      → "+13055551234"
 *   "13055551234"     → "+13055551234"
 *   "+13055551234"    → "+13055551234"
 *
 * @throws Never — returns best-effort normalization. Use `isValidE164` to validate.
 */
export function normalizeToE164(raw: string): string {
  const trimmed = raw.trim();

  // Already in E.164?
  if (E164_US_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Strip all non-digit characters
  const digits = trimmed.replace(DIGIT_ONLY_REGEX, '');

  // 10 digits → prepend +1
  if (digits.length === 10) {
    return `${US_COUNTRY_CODE}${digits}`;
  }

  // 11 digits starting with 1 → prepend +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Can't normalize — return as-is so validation catches it
  return trimmed;
}

/**
 * Validate that a phone string is in proper US E.164 format.
 */
export function isValidE164(phone: string): boolean {
  return E164_US_REGEX.test(phone);
}

/**
 * Mask a phone number for use in audit logs and non-privileged displays.
 *
 *   "+13055551234" → "+1***5551234"
 *   "3055551234"   → "***5551234"
 *   ""             → ""
 */
export function maskPhone(phone: string): string {
  if (!phone) return '';

  // For E.164 format: mask area code (digits 3-5)
  if (E164_US_REGEX.test(phone)) {
    return `${phone.slice(0, 2)}***${phone.slice(5)}`;
  }

  // Best-effort for non-normalized: mask first 3 digits
  const digits = phone.replace(DIGIT_ONLY_REGEX, '');
  if (digits.length >= 7) {
    return `***${digits.slice(3)}`;
  }

  // Too short to meaningfully mask
  return '***';
}

/**
 * Format an E.164 phone number for human-readable display.
 *
 *   "+13055551234" → "(305) 555-1234"
 *
 * Returns the input unchanged if it's not a valid E.164 US number.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  if (!E164_US_REGEX.test(phone)) {
    return phone;
  }

  const area = phone.slice(2, 5);
  const prefix = phone.slice(5, 8);
  const line = phone.slice(8, 12);

  return `(${area}) ${prefix}-${line}`;
}

// ── Zod schema ───────────────────────────────────────────────────────────────

/**
 * Zod schema that normalizes raw phone input to E.164 and validates the result.
 *
 * Usage:
 *   const schema = z.object({ phone: phoneE164Schema });
 *   schema.parse({ phone: "(305) 555-1234" });
 *   // → { phone: "+13055551234" }
 */
export const phoneE164Schema = z
  .string()
  .min(1, 'Phone number is required')
  .transform(normalizeToE164)
  .refine(isValidE164, { message: 'Invalid US phone number. Expected format: (XXX) XXX-XXXX' });

/**
 * Optional phone schema — allows null/undefined, normalizes + validates if present.
 */
export const phoneE164OptionalSchema = z
  .string()
  .nullable()
  .optional()
  .transform((val) => {
    if (!val) return null;
    return normalizeToE164(val);
  })
  .refine(
    (val) => val === null || isValidE164(val),
    { message: 'Invalid US phone number. Expected format: (XXX) XXX-XXXX' },
  );
