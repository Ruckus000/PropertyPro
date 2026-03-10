# TOKEN_ENCRYPTION_KEY Rotation Runbook

## Overview

`TOKEN_ENCRYPTION_KEY` is an AES-256-GCM hex key used to encrypt OAuth tokens
at rest for calendar sync (Google) and accounting connectors (QuickBooks/Xero).

**Current limitation:** The encryption format stores `base64(iv + ciphertext + authTag)`
with no key version prefix. Only one key is supported at a time. Rotating the key
makes all tokens encrypted with the previous key permanently unreadable.

## Affected Tables

| Table | Encrypted Columns | Service |
|-------|-------------------|---------|
| `calendar_sync_tokens` | `access_token`, `refresh_token` | `calendar-sync-service.ts` |
| `accounting_connections` | `access_token`, `refresh_token` | `accounting-connectors-service.ts` |

## When to Rotate

- Suspected key compromise
- Employee with key access leaves the organization
- Periodic rotation per security policy (recommend annually)

## Pre-Rotation Checklist

- [ ] Schedule a maintenance window — all affected OAuth connections will break
- [ ] Notify affected communities that calendar sync and accounting integrations
      will require re-authentication
- [ ] Confirm the new key is a 64-character hex string (`openssl rand -hex 32`)

## Rotation Procedure

### 1. Generate new key

```bash
openssl rand -hex 32
```

### 2. Disconnect all active connections (graceful)

Before rotating, programmatically disconnect active connections so users see a
clean "Connect" state rather than a broken sync:

```sql
-- Audit: count affected rows
SELECT 'calendar_sync_tokens' AS table_name, count(*) FROM calendar_sync_tokens
UNION ALL
SELECT 'accounting_connections', count(*) FROM accounting_connections
WHERE deleted_at IS NULL;
```

Run the disconnect flow per community via the API (preferred) or, if unavailable,
hard-delete the token rows:

```sql
-- DESTRUCTIVE: only after confirming the above counts
BEGIN;
DELETE FROM calendar_sync_tokens;
DELETE FROM accounting_connections WHERE deleted_at IS NULL;
COMMIT;
```

### 3. Update the environment variable

- **Vercel:** Project Settings > Environment Variables > update `TOKEN_ENCRYPTION_KEY`
- **GitHub Secrets:** Update `DEMO_TOKEN_ENCRYPTION_KEY_HEX` for CI
- **Local:** Update root `.env.local`

Ensure the value is identical across all deployment targets. Mismatched keys
between server instances cause `Failed to decrypt token payload` errors.

### 4. Redeploy

Trigger a production deploy so all serverless instances pick up the new key.

### 5. Verify

```bash
# Confirm no decrypt errors in logs
# Users reconnect their calendar/accounting integrations
```

## Future Improvement (Phase 6)

Add key versioning to the encryption format:

```
version(1 byte) + base64(iv + ciphertext + authTag)
```

This would allow decryption to try multiple keys by version, enabling zero-downtime
rotation where old tokens are re-encrypted on read with the new key.

## Failure Modes

| Symptom | Cause | Resolution |
|---------|-------|------------|
| `Failed to decrypt token payload` in logs | Key mismatch between env and stored tokens | Verify `TOKEN_ENCRYPTION_KEY` matches the key used to encrypt. If rotated, affected users must re-authenticate. |
| `TOKEN_ENCRYPTION_KEY is required` on startup | Env var missing | Add the key to all deployment environments. |
| Calendar sync / accounting sync returns 500 | Decryption failure on stored tokens | Check audit log for the affected `community_id` and `user_id`. User must disconnect and reconnect. |
| Different behavior across serverless instances | Key differs between instances | Ensure Vercel env var is set at the correct scope (Production + Preview) and redeploy. |
