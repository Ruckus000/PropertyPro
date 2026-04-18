import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordStrengthIndicator } from '../../src/components/auth/password-strength-indicator';

describe('PasswordStrengthIndicator', () => {
  it('returns null when hideOnEmpty is set and password is empty', () => {
    const { container } = render(<PasswordStrengthIndicator password="" hideOnEmpty />);
    expect(container.firstChild).toBeNull();
  });

  it('renders role="status" with aria-live="polite"', () => {
    render(<PasswordStrengthIndicator password="Abc" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('labels weak password as Weak', () => {
    render(<PasswordStrengthIndicator password="a" />);
    expect(screen.getByTestId('password-strength-label').textContent).toBe('Weak');
  });

  it('labels fully compliant password as Strong', () => {
    render(<PasswordStrengthIndicator password="Secure!123" />);
    expect(screen.getByTestId('password-strength-label').textContent).toBe('Strong');
  });

  it('labels 4-rule satisfying password as Good', () => {
    render(<PasswordStrengthIndicator password="Abcdefg1" />);
    expect(screen.getByTestId('password-strength-label').textContent).toBe('Good');
  });

  it('lists only the failed rules', () => {
    render(<PasswordStrengthIndicator password="abcdefgh" />);
    const list = screen.getByLabelText('Password requirements');
    const labels = Array.from(list.querySelectorAll('li')).map((li) => li.textContent);
    expect(labels).toContain('Uppercase letter');
    expect(labels).toContain('Number');
    expect(labels).toContain('Special character');
    expect(labels).not.toContain('Lowercase letter');
    expect(labels).not.toContain('8+ characters');
  });

  it('hides the failed-rules list when all rules pass', () => {
    render(<PasswordStrengthIndicator password="Secure!123" />);
    expect(screen.queryByLabelText('Password requirements')).toBeNull();
  });

  it('honors the id prop on the outer wrapper', () => {
    render(<PasswordStrengthIndicator password="Abc1!" id="signup-password-strength" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('id')).toBe('signup-password-strength');
  });
});
