/**
 * GET /api/v1/internal/readiness
 *
 * Deployment readiness check. Validates stripe_prices completeness, database
 * connectivity, runtime schema compatibility, Supabase auth availability, the
 * load-bearing secrets, and that email is actually being delivered.
 *
 * Auth: Bearer token via READINESS_CHECK_SECRET.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolveDeliveryMode } from '@propertypro/email';
import { requireCronSecret } from '@/lib/api/cron-auth';
import {
  checkDatabaseConnectivity,
  checkPendingSignupsSchema,
  checkStripePricesCompleteness,
  checkSupabaseAuth,
  type CheckResult,
} from '@/lib/services/readiness-service';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    requireCronSecret(req, process.env.READINESS_CHECK_SECRET, process.env.CRON_SECRET);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks: Record<string, CheckResult> = {};

  // 1. Stripe prices completeness check
  checks.stripe_prices = await checkStripePricesCompleteness();

  // 2. Database connectivity check
  checks.database = await checkDatabaseConnectivity();

  // 3. Runtime schema compatibility check
  checks.schema_compatibility = await checkPendingSignupsSchema();

  // 4. Supabase auth check
  checks.supabase_auth = await checkSupabaseAuth();

  // 5. REAUTH_JWT_SECRET check — required for billing portal, account
  // deletion, and any other reauth-gated route. A missing/short secret in
  // production silently 500s those flows from the user's perspective.
  {
    const secret = process.env.REAUTH_JWT_SECRET;
    if (!secret) {
      checks.reauth_jwt_secret = {
        status: 'fail',
        error: 'REAUTH_JWT_SECRET is not set',
      };
    } else if (secret.length < 32) {
      checks.reauth_jwt_secret = {
        status: 'fail',
        error: `REAUTH_JWT_SECRET is too short (${secret.length} chars; min 32)`,
      };
    } else {
      checks.reauth_jwt_secret = { status: 'pass' };
    }
  }

  // 6. Load-bearing secrets whose absence fails SILENTLY in production.
  //
  // Each of these was actually unset in production and nothing surfaced it:
  //   - CRON_SECRET: Vercel Cron only sends `Authorization: Bearer $CRON_SECRET`
  //     when the var exists. Unset, it sends no header, every scheduled job
  //     401s, and the platform still reports the cron as registered and firing.
  //     Every scheduled job (16 as of apps/web/vercel.json) was dead for months
  //     with a green dashboard.
  //   - OTP_HMAC_SECRET: access-request OTPs are 6 digits, so the HMAC secret is
  //     the only barrier to precomputing the whole space.
  //   - TOKEN_ENCRYPTION_KEY: calendar sync and accounting connectors throw
  //     without it, so those features 500 rather than degrade.
  //   - OAUTH_STATE_SECRET: `signOAuthState` throws without it, so connecting a
  //     Google Calendar or an accounting platform 500s instead of degrading.
  //   - SUPPORT_SESSION_JWT_SECRET: the admin app signs the support-access JWT
  //     and web verifies it. Absent on either side, Start Session 500s and the
  //     popup never opens — the exact failure that made `support-access` look
  //     like a broken E2E spec for months.
  //   - The three *_UNSUBSCRIBE_SECRETs: their signers return `null` rather than
  //     throwing (deliberately — a bulk sender must not be taken down by an
  //     unset var), so the emails still go out, silently carrying a
  //     login-walled settings URL instead of a working one-click link. That
  //     defeats RFC 8058 and the CAN-SPAM no-account-required expectation, and
  //     nothing anywhere reports it.
  //
  // This is the check that would have caught the cron outage on day one. It
  // deliberately makes "a secret is missing" a monitorable signal instead of
  // silence.
  //
  // TOKEN_ENCRYPTION_KEY is checked by FORMAT, not by minimum length. A length
  // floor cannot express its requirement: `parseTokenEncryptionKeyHex` demands
  // exactly 64 hex characters, so `openssl rand -hex 64` (128 chars — the
  // argument is a byte count) and any 64-character non-hex passphrase both pass
  // a `length >= 64` test while throwing on every encrypt and decrypt. That
  // combination is the worst case this check exists to prevent: a green
  // readiness probe over a permanently broken encryption path.
  const secretRules = [
    { name: 'CRON_SECRET', minLength: 16 },
    { name: 'OTP_HMAC_SECRET', minLength: 16 },
    { name: 'TOKEN_ENCRYPTION_KEY', exactHexChars: 64 },
    { name: 'OAUTH_STATE_SECRET', minLength: 16 },
    { name: 'SUPPORT_SESSION_JWT_SECRET', minLength: 32 },
    { name: 'COMMUNITY_EMAIL_UNSUBSCRIBE_SECRET', minLength: 16 },
    { name: 'SNOWBIRD_UNSUBSCRIBE_SECRET', minLength: 16 },
    { name: 'INSURANCE_ALERTS_UNSUBSCRIBE_SECRET', minLength: 16 },
    // The support inbox's ingress HMAC. This one is not merely a degraded
    // feature when unset: the webhook fails CLOSED, so support@ / privacy@ /
    // contact@ stop being ingested entirely. The sender's mail server holds
    // each message and retries for 24-72 hours, which is a real window to fix
    // it in — but only if somebody knows.
    { name: 'INBOUND_EMAIL_WEBHOOK_SECRET', minLength: 32 },
  ] as const;

  for (const rule of secretRules) {
    const value = process.env[rule.name];
    const key = rule.name.toLowerCase();

    if (!value) {
      checks[key] = { status: 'fail', error: `${rule.name} is not set` };
      continue;
    }

    if ('exactHexChars' in rule) {
      const valid = new RegExp(`^[0-9a-fA-F]{${rule.exactHexChars}}$`).test(value);
      checks[key] = valid
        ? { status: 'pass' }
        : {
            status: 'fail',
            error: `${rule.name} must be exactly ${rule.exactHexChars} hex characters (got ${value.length})`,
          };
      continue;
    }

    checks[key] =
      value.length < rule.minLength
        ? {
            status: 'fail',
            error: `${rule.name} is too short (${value.length} chars; min ${rule.minLength})`,
          }
        : { status: 'pass' };
  }

  // 7. Email delivery mode.
  //
  // `sendEmail` does NOT throw when RESEND_API_KEY is unset — it collects the
  // message in an in-memory test inbox and returns successfully. In production
  // that means every verification email, invitation and statutory notice is
  // silently discarded while every call site reports success. EMAIL_DRY_RUN
  // does the same thing deliberately, and is correct for an ops script run but
  // never for a deployed app.
  //
  // Delegated to `resolveDeliveryMode` rather than re-reading the two env vars:
  // it owns the precedence (dry-run outranks a configured key) and the
  // truthiness rules ('0'/'false'/'no' are falsy), and a second copy here would
  // drift from the behaviour it is supposed to be reporting on.
  {
    const mode = resolveDeliveryMode();
    checks.email_delivery =
      mode === 'live'
        ? { status: 'pass' }
        : {
            status: 'fail',
            error:
              mode === 'dry-run'
                ? 'EMAIL_DRY_RUN is set — no mail is being delivered'
                : 'RESEND_API_KEY is not set — mail is silently discarded',
          };
  }

  // Determine overall status
  const dbOk = checks.database?.status === 'pass';
  const authOk = checks.supabase_auth?.status === 'pass';
  const pricesOk = checks.stripe_prices?.status === 'pass';
  const schemaOk = checks.schema_compatibility?.status === 'pass';
  const reauthOk = checks.reauth_jwt_secret?.status === 'pass';
  // Grouped with the other secret checks rather than the connectivity ones: a
  // missing secret is a real fault, but the process is still serving traffic,
  // so it must not read as 'healthy' while stopping short of 'unhealthy'.
  //
  // Derived from `secretRules` rather than naming each check, so adding a rule
  // above cannot silently leave it out of the roll-up — a check that is
  // computed and reported but never affects `status` is worse than no check,
  // because the probe reports green while carrying a known fault.
  const secretsOk =
    secretRules.every((rule) => checks[rule.name.toLowerCase()]?.status === 'pass') &&
    checks.email_delivery?.status === 'pass';

  let status: 'healthy' | 'degraded' | 'unhealthy';
  if (dbOk && authOk && schemaOk && pricesOk && reauthOk && secretsOk) {
    status = 'healthy';
  } else if (dbOk && authOk && schemaOk && reauthOk) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }

  const statusCode = status === 'unhealthy' ? 503 : 200;
  return NextResponse.json({ status, checks }, { status: statusCode });
}
