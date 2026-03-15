/**
 * Branding API validation tests.
 *
 * Validates the Zod schema used by PATCH /api/admin/communities/:id/branding
 * without hitting the database.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { isValidHexColor } from '@propertypro/shared';
import { ALLOWED_FONTS } from '@propertypro/theme';

// Re-create the schema here to unit test validation logic independently
const HEX_COLOR = z.string().refine(isValidHexColor, { message: 'Must be a valid hex color' });
const FONT = z.string().refine(
  (f) => (ALLOWED_FONTS as readonly string[]).includes(f),
  { message: 'Font not in allowed list' },
);

const patchSchema = z.object({
  primaryColor: HEX_COLOR.optional(),
  secondaryColor: HEX_COLOR.optional(),
  accentColor: HEX_COLOR.optional(),
  fontHeading: FONT.optional(),
  fontBody: FONT.optional(),
  logoStoragePath: z.string().max(500).optional(),
}).strict();

describe('branding PATCH schema', () => {
  it('accepts valid hex colors', () => {
    const result = patchSchema.safeParse({
      primaryColor: '#2563EB',
      secondaryColor: '#6B7280',
      accentColor: '#DBEAFE',
    });
    expect(result.success).toBe(true);
  });

  it('accepts lowercase hex colors', () => {
    const result = patchSchema.safeParse({ primaryColor: '#ff00aa' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid hex colors', () => {
    const result = patchSchema.safeParse({ primaryColor: 'not-a-color' });
    expect(result.success).toBe(false);
  });

  it('rejects 3-digit hex colors', () => {
    const result = patchSchema.safeParse({ primaryColor: '#FFF' });
    expect(result.success).toBe(false);
  });

  it('rejects hex without hash', () => {
    const result = patchSchema.safeParse({ primaryColor: '2563EB' });
    expect(result.success).toBe(false);
  });

  it('accepts allowed fonts', () => {
    const result = patchSchema.safeParse({
      fontHeading: 'Inter',
      fontBody: 'Poppins',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fonts', () => {
    const result = patchSchema.safeParse({ fontHeading: 'Comic Sans MS' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown properties (strict mode)', () => {
    const result = patchSchema.safeParse({
      primaryColor: '#2563EB',
      malicious: 'payload',
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty object (no changes)', () => {
    const result = patchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts logoStoragePath', () => {
    const result = patchSchema.safeParse({
      logoStoragePath: '123/site/abc-def.webp',
    });
    expect(result.success).toBe(true);
  });

  it('rejects logoStoragePath over 500 chars', () => {
    const result = patchSchema.safeParse({
      logoStoragePath: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a full valid payload', () => {
    const result = patchSchema.safeParse({
      primaryColor: '#059669',
      secondaryColor: '#6B7280',
      accentColor: '#D1FAE5',
      fontHeading: 'Urbanist',
      fontBody: 'Figtree',
      logoStoragePath: '42/site/logo.webp',
    });
    expect(result.success).toBe(true);
  });
});
