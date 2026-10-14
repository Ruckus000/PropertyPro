# Runbook: Operator Console two-factor (TOTP)

Since ponytail audit #14 the admin console (`apps/admin`) refuses a
password-only session. A platform admin must pass a TOTP code from an
authenticator app, which raises the Supabase session to `aal2`. The check runs
twice: in the middleware (step 8) and in `requirePlatformAdmin`, which every
admin API route calls.

## First sign-in after the deploy

1. Sign in at `/auth/login` with your email and password as usual.
2. You are sent to `/auth/mfa`. With no factor yet, it shows a QR code and the
   secret. Add it to an authenticator app (1Password, Google Authenticator,
   Authy) and enter the 6-digit code.
3. You land on the page you asked for. Every later sign-in asks for a code.

Enrol **as soon as the deploy is Ready**. Until your first factor is verified,
anyone holding the password could enrol their own authenticator instead.

## Lost authenticator

There is no self-service reset, deliberately. A Supabase project owner removes
the factor, then the admin enrols again at the next sign-in:

- Supabase dashboard: **Authentication → Users →** the admin **→ MFA factors →
  delete**, or
- the Auth admin API, `auth.admin.mfa.deleteFactor({ id, userId })`
  (`auth.admin.mfa.listFactors({ userId })` gives the id).

Record who asked and why in `platform_admin_audit_log` (see
`.claude/rules/migration-safety.md`, "Prod Data Repairs"), since this bypasses
the app.

## Local and CI

The Supabase CLI template ships TOTP **off**. `scripts/agent-env.sh` and
`.github/workflows/e2e.yml` turn on `[auth.mfa.totp] enroll_enabled` and
`verify_enabled`; a sandbox started before that change needs a restart
(`pnpm agent:env:reset`). The admin `/dev/agent-login` route (development and
a local backend only) enrols a fresh factor for `e2e.platform.admin@local` and
answers it with a computed code, so e2e reaches the console through the real
`aal2` path.

## Hosted project setting

Supabase documents TOTP as enabled on all hosted projects by default. If a
platform admin sees "MFA enroll is disabled" on `/auth/mfa`, turn on
**Authentication → Multi-Factor → Authenticator app (TOTP)** for the project.
