/**
 * POST /api/v1/auth/resend-verification
 *
 * Re-sends the signup verification email for a pending signup.
 * Requires only the signupRequestId — the auth user and email
 * are looked up from the pendingSignups row.
 *
 * Plan A1 drain #154. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts`. Preserves 409/429 wire shapes via route-level dispatch.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, NotFoundError } from '@/lib/api/errors';
import { sendEmail } from '@propertypro/email';
import { createElement } from 'react';
import { SignupVerificationEmail } from '@propertypro/email';
import {
  generateVerificationActionLink,
  getPendingSignupForResend,
  markVerificationEmailSent,
} from '@/lib/services/provisioning-service';
import { resendVerificationPostContract } from './contract';

const VERIFICATION_EMAIL_COOLDOWN_MS = 2 * 60 * 1000;

class ResendAlreadyVerifiedError extends Error {
  readonly payload: { alreadyVerified: true; signupRequestId: string };

  constructor(signupRequestId: string) {
    super('Already verified');
    this.payload = { alreadyVerified: true, signupRequestId };
  }
}

class ResendCooldownError extends Error {
  constructor(
    message: string,
    readonly cooldownRemainingSeconds: number,
  ) {
    super(message);
  }
}

const runResendVerification = runRoute(
  resendVerificationPostContract,
  async ({ body }) => {
    const { signupRequestId } = body;

    const signup = await getPendingSignupForResend(signupRequestId);

    if (!signup) {
      throw new NotFoundError('Signup request not found or has expired.');
    }

    if (signup.expiresAt && new Date(signup.expiresAt) < new Date()) {
      throw new NotFoundError('This signup request has expired. Please start a new signup.');
    }

    if (signup.status === 'email_verified' || signup.status === 'checkout_started') {
      throw new ResendAlreadyVerifiedError(signup.signupRequestId);
    }

    if (signup.status !== 'pending_verification') {
      throw new AppError('This signup cannot receive verification emails.', 400, 'BAD_REQUEST');
    }

    if (signup.verificationEmailSentAt) {
      const elapsed = Date.now() - new Date(signup.verificationEmailSentAt).getTime();
      const remaining = VERIFICATION_EMAIL_COOLDOWN_MS - elapsed;
      if (remaining > 0) {
        throw new ResendCooldownError(
          'Verification email was sent recently. Please wait before requesting another.',
          Math.ceil(remaining / 1000),
        );
      }
    }

    if (!signup.authUserId) {
      console.error(JSON.stringify({
        event: 'resend_verification.no_auth_user',
        signupRequestId: signup.signupRequestId,
      }));
      throw new AppError(
        'Unable to resend verification. Please try signing up again.',
        400,
        'BAD_REQUEST',
      );
    }

    const verificationRedirectUrl = buildVerificationRedirectUrl(signup.signupRequestId);
    const linkResult = await generateVerificationActionLink({
      signupRequestId: signup.signupRequestId,
      email: signup.email,
      redirectTo: verificationRedirectUrl,
    });

    if (!linkResult.ok) {
      console.error(JSON.stringify({
        event: 'resend_verification.link_generation_failed',
        signupRequestId: signup.signupRequestId,
        error: linkResult.error,
      }));
      throw new AppError(
        'Unable to generate verification link. Please try again.',
        500,
        'INTERNAL_ERROR',
      );
    }

    let messageId: string;
    try {
      const result = await sendEmail({
        to: signup.email,
        subject: 'Verify your email to continue your PropertyPro signup',
        category: 'transactional',
        react: createElement(SignupVerificationEmail, {
          branding: { communityName: 'PropertyPro Florida' },
          primaryContactName: signup.primaryContactName ?? 'there',
          communityName: signup.communityName ?? 'your community',
          verificationLink: linkResult.actionLink,
        }),
      });
      messageId = result.id;
    } catch (emailError) {
      console.error(JSON.stringify({
        event: 'resend_verification.email_failed',
        signupRequestId: signup.signupRequestId,
        error: emailError instanceof Error ? emailError.message : String(emailError),
      }));
      throw new AppError(
        'Unable to send verification email. Please try again.',
        500,
        'INTERNAL_ERROR',
      );
    }

    await markVerificationEmailSent(signup.id, messageId);

    console.info(JSON.stringify({
      event: 'resend_verification.sent',
      signupRequestId: signup.signupRequestId,
    }));

    return {
      sent: true as const,
      cooldownSeconds: VERIFICATION_EMAIL_COOLDOWN_MS / 1000,
    };
  },
);

export const POST = withErrorHandler(async (req: NextRequest) => {
  try {
    return await runResendVerification(req);
  } catch (error) {
    if (error instanceof ResendAlreadyVerifiedError) {
      return NextResponse.json({ data: error.payload }, { status: 409 });
    }
    if (error instanceof ResendCooldownError) {
      return NextResponse.json(
        {
          error: {
            message: error.message,
            cooldownRemainingSeconds: error.cooldownRemainingSeconds,
          },
        },
        { status: 429 },
      );
    }
    throw error;
  }
});

function buildVerificationRedirectUrl(signupRequestId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  const url = new URL('/signup', baseUrl);
  url.searchParams.set('signupRequestId', signupRequestId);
  url.searchParams.set('verified', '1');
  return url.toString();
}
