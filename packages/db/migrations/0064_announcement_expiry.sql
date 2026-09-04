ALTER TABLE "announcements" ADD COLUMN "expires_at" timestamp with time zone;

-- Documented in the database, not only in the TypeScript schema: this column
-- is read by the public-site reader and by the authenticated feed, and the
-- next person to meet it may be looking at psql rather than at schema.ts.
COMMENT ON COLUMN "announcements"."expires_at" IS
  'When non-null, the announcement stops being shown at this instant. Distinct from archived_at, which records a manual act already taken; this is a decision taken in advance. Null means no expiry, which is every pre-existing row.';
