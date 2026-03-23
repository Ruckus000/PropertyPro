'use client';

import { useState, type FormEvent } from 'react';
import { AlertCircle, Check, User, Lock, Shield, Trash2, Clock } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// ── Password requirements (same as set-password-form) ──────────────

interface PasswordRequirement {
  label: string;
  test: (pw: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'At most 72 characters', test: (pw) => pw.length <= 72 },
  { label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'One special character', test: (pw) => /[^a-zA-Z0-9]/.test(pw) },
];

function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be at most 72 characters.';
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain a number.';
  if (!/[^a-zA-Z0-9]/.test(pw)) return 'Password must contain a special character.';
  return null;
}

// ── Shared styles ──────────────────────────────────────

const inputClassName =
  'w-full rounded-[var(--radius-sm,6px)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)] disabled:cursor-not-allowed disabled:opacity-50';

const labelClassName = 'mb-1.5 block text-sm font-medium text-[var(--text-secondary)]';

const cardClassName =
  'rounded-[var(--radius-md,10px)] border border-[var(--border-default)] bg-[var(--surface-card)] p-5';

// ── Props ──────────────────────────────────────────────

interface AccountSettingsClientProps {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
}

export function AccountSettingsClient({
  email,
  fullName: initialFullName,
  phone: initialPhone,
}: AccountSettingsClientProps) {
  // ── Profile state ──────────────────────────────
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // ── Password state ─────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRequirements, setShowRequirements] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // ── Profile handlers ───────────────────────────

  const profileDirty = fullName !== initialFullName || phone !== initialPhone;

  async function handleProfileSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);

    if (!fullName.trim()) {
      setProfileError('Name is required.');
      return;
    }

    setProfileLoading(true);

    try {
      const res = await fetch('/api/v1/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
        }),
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setProfileError(json?.error?.message ?? 'Failed to update profile. Please try again.');
        return;
      }

      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 5000);
    } catch {
      setProfileError('An unexpected error occurred. Please try again.');
    } finally {
      setProfileLoading(false);
    }
  }

  // ── Password handlers ──────────────────────────

  async function handlePasswordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    const pwError = validatePassword(newPassword);
    if (pwError) {
      setPasswordError(pwError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordLoading(true);

    try {
      const supabase = createBrowserClient();

      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInError) {
        setPasswordError('Current password is incorrect.');
        setPasswordLoading(false);
        return;
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPasswordError('Failed to update password. Please try again.');
        setPasswordLoading(false);
        return;
      }

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowRequirements(false);

      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch {
      setPasswordError('An unexpected error occurred. Please try again.');
    } finally {
      setPasswordLoading(false);
    }
  }

  const canSubmitPassword =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !passwordLoading;

  // ── Render ─────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Account Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Manage your personal information and security.
        </p>
      </div>

      {/* ── Profile Section ──────────────────────────── */}
      <section aria-labelledby="profile-heading">
        <div className={cardClassName}>
          <div className="mb-4 flex items-center gap-2">
            <User size={18} className="text-[var(--text-secondary)]" aria-hidden="true" />
            <h2 id="profile-heading" className="text-base font-semibold text-[var(--text-primary)]">
              Profile
            </h2>
          </div>

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label htmlFor="account-fullName" className={labelClassName}>
                Full Name
              </label>
              <input
                id="account-fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClassName}
                disabled={profileLoading}
              />
            </div>

            <div>
              <label htmlFor="account-email" className={labelClassName}>
                Email
              </label>
              <input
                id="account-email"
                type="email"
                value={email}
                readOnly
                className={cn(inputClassName, 'cursor-not-allowed bg-[var(--surface-secondary)] opacity-70')}
                aria-describedby="email-note"
              />
              <p id="email-note" className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                Contact support to change your email address.
              </p>
            </div>

            <div>
              <label htmlFor="account-phone" className={labelClassName}>
                Phone <span className="font-normal text-[var(--text-tertiary)]">(optional)</span>
              </label>
              <input
                id="account-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className={inputClassName}
                disabled={profileLoading}
              />
            </div>

            {profileError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-[var(--radius-sm,6px)] border border-[var(--border-error)] bg-[var(--surface-error)] px-3 py-2.5 text-sm text-[var(--text-error)]"
              >
                <AlertCircle size={16} aria-hidden="true" />
                {profileError}
              </div>
            )}

            {profileSuccess && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-[var(--radius-sm,6px)] border border-[var(--border-success)] bg-[var(--surface-success)] px-3 py-2.5 text-sm text-[var(--text-success)]"
              >
                <Check size={16} aria-hidden="true" />
                Profile updated successfully.
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={profileLoading || !profileDirty}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md,10px)] px-4 py-2.5 text-sm font-medium transition-colors',
                  'bg-[var(--interactive-primary)] text-[var(--text-on-primary)] hover:bg-[var(--interactive-primary-hover)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {profileLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Password Section ─────────────────────────── */}
      <section aria-labelledby="password-heading">
        <div className={cardClassName}>
          <div className="mb-4 flex items-center gap-2">
            <Lock size={18} className="text-[var(--text-secondary)]" aria-hidden="true" />
            <h2 id="password-heading" className="text-base font-semibold text-[var(--text-primary)]">
              Password
            </h2>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="account-currentPassword" className={labelClassName}>
                Current Password
              </label>
              <input
                id="account-currentPassword"
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                className={inputClassName}
                disabled={passwordLoading}
              />
            </div>

            <div>
              <label htmlFor="account-newPassword" className={labelClassName}>
                New Password
              </label>
              <input
                id="account-newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={72}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setShowRequirements(true);
                }}
                onFocus={() => setShowRequirements(true)}
                placeholder="Min. 8 characters with mixed case, number & symbol"
                className={inputClassName}
                disabled={passwordLoading}
              />
              {showRequirements && newPassword.length > 0 && (
                <ul className="mt-2 space-y-1" aria-label="Password requirements">
                  {PASSWORD_REQUIREMENTS.map((req) => {
                    const met = req.test(newPassword);
                    return (
                      <li
                        key={req.label}
                        className={cn(
                          'flex items-center gap-1.5 text-xs',
                          met ? 'text-[var(--text-success)]' : 'text-[var(--text-tertiary)]',
                        )}
                      >
                        <span aria-hidden="true">{met ? '\u2713' : '\u25CB'}</span>
                        {req.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div>
              <label htmlFor="account-confirmPassword" className={labelClassName}>
                Confirm New Password
              </label>
              <input
                id="account-confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                className={inputClassName}
                disabled={passwordLoading}
              />
            </div>

            {passwordError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-[var(--radius-sm,6px)] border border-[var(--border-error)] bg-[var(--surface-error)] px-3 py-2.5 text-sm text-[var(--text-error)]"
              >
                <AlertCircle size={16} aria-hidden="true" />
                {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-[var(--radius-sm,6px)] border border-[var(--border-success)] bg-[var(--surface-success)] px-3 py-2.5 text-sm text-[var(--text-success)]"
              >
                <Check size={16} aria-hidden="true" />
                Password updated successfully.
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={!canSubmitPassword}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md,10px)] px-4 py-2.5 text-sm font-medium transition-colors',
                  'bg-[var(--interactive-primary)] text-[var(--text-on-primary)] hover:bg-[var(--interactive-primary-hover)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {passwordLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Danger Zone ──────────────────────────────── */}
      <DangerZoneSection />
    </div>
  );
}

// ── Danger Zone / Account Deletion ─────────────────────────

interface DeletionRequest {
  id: number;
  status: 'cooling' | 'recovering' | 'purging' | 'completed' | 'canceled';
  coolingEndsAt: string;
  createdAt: string;
}

function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function DangerZoneSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const queryClient = useQueryClient();

  // Fetch active deletion request
  const { data: deletionRequest, isLoading } = useQuery<DeletionRequest | null>({
    queryKey: ['account-deletion-request'],
    queryFn: async () => {
      const res = await fetch('/api/v1/account/delete');
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch deletion status');
      const json = await res.json();
      return json.data ?? null;
    },
  });

  // Request deletion
  const requestDeletion = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(json?.error?.message ?? 'Failed to request account deletion.');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-deletion-request'] });
      setDialogOpen(false);
      setConfirmText('');
    },
  });

  // Cancel deletion
  const cancelDeletion = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/account/delete', {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(json?.error?.message ?? 'Failed to cancel account deletion.');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account-deletion-request'] });
    },
  });

  const hasCoolingRequest = deletionRequest?.status === 'cooling';

  return (
    <section aria-labelledby="danger-heading">
      <div className={cn(cardClassName, 'border-[var(--border-error)]')}>
        <div className="mb-3 flex items-center gap-2">
          <Shield size={18} className="text-[var(--text-error)]" aria-hidden="true" />
          <h2 id="danger-heading" className="text-base font-semibold text-[var(--text-error)]">
            Danger Zone
          </h2>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Delete Account</h3>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Request permanent deletion of your account. You&apos;ll have 30 days to change your
              mind, and your data is recoverable for 6 months after that.
            </p>
          </div>

          {isLoading ? (
            <div className="h-10 w-48 animate-pulse rounded-[var(--radius-md,10px)] bg-[var(--surface-secondary)]" />
          ) : hasCoolingRequest ? (
            <div className="space-y-3">
              <div
                role="status"
                className="flex items-center gap-2 rounded-[var(--radius-sm,6px)] border border-[var(--border-error)] bg-[var(--surface-error)] px-3 py-2.5 text-sm text-[var(--text-error)]"
              >
                <Clock size={16} aria-hidden="true" />
                <span>
                  Deletion scheduled &mdash; {getDaysUntil(deletionRequest.coolingEndsAt)} days
                  remaining in cooling period.
                </span>
              </div>
              <button
                type="button"
                onClick={() => cancelDeletion.mutate()}
                disabled={cancelDeletion.isPending}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md,10px)] px-4 py-2.5 text-sm font-medium transition-colors',
                  'border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)]',
                  'hover:bg-[var(--surface-secondary)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {cancelDeletion.isPending ? 'Canceling...' : 'Cancel Deletion'}
              </button>
              {cancelDeletion.isError && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-[var(--radius-sm,6px)] border border-[var(--border-error)] bg-[var(--surface-error)] px-3 py-2.5 text-sm text-[var(--text-error)]"
                >
                  <AlertCircle size={16} aria-hidden="true" />
                  {cancelDeletion.error instanceof Error
                    ? cancelDeletion.error.message
                    : 'Failed to cancel deletion. Please try again.'}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md,10px)] px-4 py-2.5 text-sm font-medium transition-colors',
                'bg-[var(--interactive-danger)] text-white hover:bg-[var(--interactive-danger-hover,var(--interactive-danger))]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2',
              )}
            >
              <Trash2 size={16} aria-hidden="true" />
              Delete My Account
            </button>
          )}
        </div>
      </div>

      {/* ── Confirmation Dialog ─────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Delete Your Account?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                <p>Account deletion happens in three phases:</p>
                <ol className="list-inside list-decimal space-y-1.5 text-sm text-[var(--text-secondary)]">
                  <li>
                    <strong className="text-[var(--text-primary)]">30-day cooling period</strong>{' '}
                    &mdash; You can cancel anytime and restore full access.
                  </li>
                  <li>
                    <strong className="text-[var(--text-primary)]">6-month recovery window</strong>{' '}
                    &mdash; Your data is retained but your account is deactivated. Contact support to
                    recover.
                  </li>
                  <li>
                    <strong className="text-[var(--text-primary)]">Permanent purge</strong> &mdash;
                    All personal data is permanently deleted.
                  </li>
                </ol>
                <div className="pt-2">
                  <label
                    htmlFor="delete-confirm-input"
                    className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
                  >
                    Type <strong className="text-[var(--text-error)]">DELETE</strong> to confirm
                  </label>
                  <input
                    id="delete-confirm-input"
                    type="text"
                    autoComplete="off"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className={inputClassName}
                  />
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          {requestDeletion.isError && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-[var(--radius-sm,6px)] border border-[var(--border-error)] bg-[var(--surface-error)] px-3 py-2.5 text-sm text-[var(--text-error)]"
            >
              <AlertCircle size={16} aria-hidden="true" />
              {requestDeletion.error instanceof Error
                ? requestDeletion.error.message
                : 'Failed to request deletion. Please try again.'}
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setDialogOpen(false);
                setConfirmText('');
              }}
              className={cn(
                'inline-flex items-center justify-center rounded-[var(--radius-md,10px)] px-4 py-2.5 text-sm font-medium transition-colors',
                'border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)]',
                'hover:bg-[var(--surface-secondary)]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2',
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={confirmText !== 'DELETE' || requestDeletion.isPending}
              onClick={() => requestDeletion.mutate()}
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md,10px)] px-4 py-2.5 text-sm font-medium transition-colors',
                'bg-[var(--interactive-danger)] text-white hover:bg-[var(--interactive-danger-hover,var(--interactive-danger))]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              {requestDeletion.isPending ? 'Requesting...' : 'Confirm Deletion'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
