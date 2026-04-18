'use client';

import {
  PASSWORD_POLICY,
  getPasswordChecks,
  scorePassword,
  type PasswordStrengthLevel,
} from '@propertypro/shared';
import { cn } from '@/lib/utils';

interface PasswordStrengthIndicatorProps {
  password: string;
  id?: string;
  hideOnEmpty?: boolean;
}

const LEVEL_LABEL: Record<PasswordStrengthLevel, string> = {
  weak: 'Weak',
  fair: 'Fair',
  good: 'Good',
  strong: 'Strong',
};

const LEVEL_FILL_COUNT: Record<PasswordStrengthLevel, number> = {
  weak: 1,
  fair: 2,
  good: 3,
  strong: 4,
};

const LEVEL_BAR_COLOR: Record<PasswordStrengthLevel, string> = {
  weak: 'bg-status-danger',
  fair: 'bg-status-warning',
  good: 'bg-status-warning',
  strong: 'bg-status-success',
};

const LEVEL_TEXT_COLOR: Record<PasswordStrengthLevel, string> = {
  weak: 'text-status-danger',
  fair: 'text-status-warning',
  good: 'text-status-warning',
  strong: 'text-status-success',
};

const SEGMENT_COUNT = 4;

export function PasswordStrengthIndicator({
  password,
  id,
  hideOnEmpty,
}: PasswordStrengthIndicatorProps) {
  if (hideOnEmpty && password.length === 0) {
    return null;
  }

  const { level } = scorePassword(password);
  const checks = getPasswordChecks(password);
  const failedRules = PASSWORD_POLICY.rules.filter((rule) => !checks[rule.id]);
  const filledSegments = password.length === 0 ? 0 : LEVEL_FILL_COUNT[level];
  const fillColor = password.length === 0 ? 'bg-surface-muted' : LEVEL_BAR_COLOR[level];
  const textColor = password.length === 0 ? 'text-content-secondary' : LEVEL_TEXT_COLOR[level];

  return (
    <div role="status" aria-live="polite" id={id} className="mt-2">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {Array.from({ length: SEGMENT_COUNT }).map((_, index) => (
            <div
              key={index}
              className={cn(
                'h-1.5 flex-1 rounded-sm transition-colors',
                index < filledSegments ? fillColor : 'bg-surface-muted',
              )}
            />
          ))}
        </div>
        <span
          data-testid="password-strength-label"
          className={cn('text-xs font-medium', textColor)}
        >
          {password.length === 0 ? 'Enter a password' : LEVEL_LABEL[level]}
        </span>
      </div>

      {password.length > 0 && failedRules.length > 0 ? (
        <ul
          aria-label="Password requirements"
          className="mt-1.5 space-y-0.5 text-xs text-content-secondary"
        >
          {failedRules.map((rule) => (
            <li key={rule.id}>{rule.label}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
