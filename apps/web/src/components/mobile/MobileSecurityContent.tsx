'use client';

import { useState } from 'react';
import { Lock, AlertCircle, Check, KeyRound } from 'lucide-react';
// The zod-free subpath: the barrel would pull zod into this client bundle.
import { validatePassword } from '@propertypro/shared/password-policy';
import { cn } from '@/lib/utils';
import { requestPasswordReset } from '@/lib/auth/actions';
import { MobileBackHeader } from '@/components/mobile/MobileBackHeader';
import { PageTransition, SlideUp } from '@/components/motion';

interface MobileSecurityContentProps {
  email: string;
  communityId: number;
}

// ── Input field ──────────────────────────────────────

const inputClassName =
  'w-full rounded-lg border border-stone-200 bg-white px-3 py-3 text-[15px] text-stone-900 placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400';

export function MobileSecurityContent({
  email,
}: MobileSecurityContentProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password state
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    // The shared policy every other password form uses. A bare length check
    // here let Supabase reject the update and the user saw only "Failed to
    // update password".
    const policyError = validatePassword(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    const clientModule = await import('@/lib/supabase/client').catch(() => null);
    if (!clientModule) {
      setError('Failed to update password. Please try again.');
      setLoading(false);
      return;
    }
    const supabase = clientModule.createBrowserClient();

    // Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInError) {
      setError('Current password is incorrect');
      setLoading(false);
      return;
    }

    // Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError('Failed to update password. Please try again.');
      setLoading(false);
      return;
    }

    setSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setLoading(false);

    setTimeout(() => setSuccess(false), 5000);
  }

  // The server action, as on /auth/forgot-password: it sets the redirect to
  // /auth/reset-password (the bare client call set none, so the email link
  // fell back to the Supabase Site URL), applies the per-email rate limit, and
  // refuses under a support session.
  async function handleForgotPassword() {
    setResetLoading(true);
    setResetSent(false);
    setResetError(null);

    try {
      const result = await requestPasswordReset(email);
      if (!result.success) {
        setResetError(result.message);
        setResetLoading(false);
        return;
      }
    } catch {
      setResetError("Couldn't send the reset link. Please try again.");
      setResetLoading(false);
      return;
    }

    setResetSent(true);
    setResetLoading(false);

    setTimeout(() => setResetSent(false), 8000);
  }

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0 &&
    !loading;

  return (
    <PageTransition>
      <MobileBackHeader title="Security" />

      <div className="pb-8">
        {/* Password change card */}
        <SlideUp>
          <div className="px-5 mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400 mb-2">
              Change Password
            </div>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="p-4 space-y-3">
                <div>
                  <label
                    htmlFor="current-password"
                    className="block text-[13px] font-medium text-stone-500 mb-1"
                  >
                    Current Password
                  </label>
                  <input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-[13px] font-medium text-stone-500 mb-1"
                  >
                    New Password
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="8+ characters, upper, lower, number, symbol"
                    autoComplete="new-password"
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-[13px] font-medium text-stone-500 mb-1"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    className={inputClassName}
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[14px] text-red-600"
                  >
                    <AlertCircle size={16} aria-hidden="true" />
                    {error}
                  </div>
                )}

                {success && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-[14px] text-green-700"
                  >
                    <Check size={16} aria-hidden="true" />
                    Password updated successfully
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={!canSubmit}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-3 text-[15px] font-semibold text-white transition-colors',
                    'hover:bg-stone-800 active:bg-stone-950',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'h-12 mt-1',
                  )}
                >
                  {loading ? (
                    'Updating...'
                  ) : (
                    <>
                      <Lock size={18} aria-hidden="true" />
                      Update Password
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </SlideUp>

        {/* Forgot password */}
        <SlideUp delay={0.05}>
          <div className="px-5 mt-5 text-center">
            {resetSent ? (
              <div
                role="status"
                className="flex items-center justify-center gap-2 text-[14px] text-green-700"
              >
                <Check size={16} aria-hidden="true" />
                Reset link sent to {email}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetLoading}
                className="inline-flex items-center gap-1.5 text-[14px] font-medium text-stone-500 underline underline-offset-2 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <KeyRound size={14} aria-hidden="true" />
                {resetLoading ? 'Sending...' : 'Forgot your password?'}
              </button>
            )}
            {resetError && !resetSent && (
              <div
                role="alert"
                className="mt-2 flex items-center justify-center gap-2 text-sm text-status-danger"
              >
                <AlertCircle size={16} aria-hidden="true" />
                {resetError}
              </div>
            )}
          </div>
        </SlideUp>
      </div>
    </PageTransition>
  );
}
