-- Expand migration: whether a meeting's agenda shows on the PUBLIC website.
--
-- #1501 put every agenda on the unauthenticated association site, including a
-- closed session's (an attorney-client or personnel matter), with no way to keep
-- one off. Default true keeps every existing meeting exactly as it is today.
--
-- Constant default + NOT NULL is a metadata-only ALTER on Postgres 11+: no
-- table rewrite, no backfill. Apply to production BEFORE the code that reads it
-- ships (deploy.yml's schema check refuses the deploy otherwise).
ALTER TABLE "meetings" ADD COLUMN "agenda_published" boolean DEFAULT true NOT NULL;
