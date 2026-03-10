# Public Site Troubleshooting Runbook

## "Public site shows no blocks" (blank page)

### Background

The `site_blocks` table uses Row-Level Security (RLS) to scope anonymous reads
to a single community. The policy (migration `0089`) reads:

```sql
CREATE POLICY site_blocks_anon_read ON site_blocks
  FOR SELECT TO anon
  USING (
    is_draft = false
    AND community_id = coalesce(
      nullif(current_setting('app.community_id', true), ''),
      '0'
    )::bigint
  );
```

**Key behavior:** When `app.community_id` is not set in the Postgres session:
- `current_setting('app.community_id', true)` returns `NULL` (no throw)
- `coalesce(nullif(NULL, ''), '0')` evaluates to `'0'`
- `community_id = 0` matches zero rows — **fail-closed, silently**

This is intentional (prevents 500 errors from unset session variables) but
produces zero diagnostic output. The query succeeds with an empty result set.

### Diagnostic Steps

#### 1. Confirm community has published blocks

```sql
SELECT id, block_type, block_order, is_draft, published_at
FROM site_blocks
WHERE community_id = <COMMUNITY_ID>
  AND deleted_at IS NULL
ORDER BY block_order;
```

If all rows have `is_draft = true`, no blocks will render. The admin must
publish them via the site builder.

#### 2. Confirm middleware sets `app.community_id`

The Supabase scoped client sets `app.community_id` via `SET LOCAL` before
queries. If the public site request doesn't resolve a community context,
the setting is never applied.

Check middleware tenant resolution:
- Is the subdomain correct? (`sunset-condos.propertyprofl.com`)
- Does `communities.slug` match the subdomain?
- Is the community `deleted_at IS NULL`?

```sql
SELECT id, slug, deleted_at FROM communities WHERE slug = '<SUBDOMAIN>';
```

#### 3. Check the tenant cache

The middleware caches slug → community_id lookups in memory for 5 minutes
(negative lookups for 30 seconds). If a community was just created or its
slug changed, the cache may serve stale data.

**Resolution:** Redeploy or wait up to 5 minutes for cache expiry.

#### 4. Confirm `x-community-id` header reaches the page

The public site root (`/`) rewrites to `/_site` with forwarded headers.
If the rewrite drops headers, the scoped client won't have a community ID.

Check server logs for the `X-Request-ID` and confirm `x-community-id` is
present in the forwarded headers.

### Common Causes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page, no errors | `app.community_id` not set (fail-closed) | Verify middleware tenant resolution for this subdomain |
| Blank page, blocks exist | All blocks are `is_draft = true` | Publish blocks in site builder |
| Blank page after slug rename | Tenant cache serves old slug | Wait 5 minutes or redeploy |
| 500 on public site | `app.community_id` set to non-numeric value | Check for upstream corruption in community ID forwarding |

### Migration History

- `0033`: Created `site_blocks` with overly permissive anon policy (all communities)
- `0034`: Fixed to scope by `current_setting('app.community_id')::bigint` — throws 500 when setting is unset
- `0088`: Forced RLS on `site_blocks` table
- `0089`: Changed to graceful fail-closed via `coalesce(nullif(...), '0')` — returns empty instead of 500
