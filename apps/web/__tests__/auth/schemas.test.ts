import { describe, expect, it } from 'vitest';
import { resetPasswordSchema } from '../../src/lib/auth/schemas';

describe('resetPasswordSchema', () => {
  it('rejects a length-only password missing character classes', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'abcdefgh',
      confirmPassword: 'abcdefgh',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password that is too short even if character classes are present', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'Ab1!',
      confirmPassword: 'Ab1!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects mismatched confirmation', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'Secure!123',
      confirmPassword: 'Secure!124',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((issue) => issue.message);
    expect(messages).toContain('Passwords do not match');
  });

  it('accepts a fully compliant password with matching confirmation', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'Secure!123',
      confirmPassword: 'Secure!123',
    });
    expect(result.success).toBe(true);
  });
});
