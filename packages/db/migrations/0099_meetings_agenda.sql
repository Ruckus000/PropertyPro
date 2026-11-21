-- Expand migration (audit 2026-11-05, H-4): a meeting's agenda, as plain text.
--
-- §718.111(12)(g)2.m–n and §720.303(4)(b)1.l–m require the agenda to be posted
-- with the meeting notice. Until now an agenda could only be an attached file,
-- and the public Meetings block shows no attachments.
--
-- Nullable, no default, no backfill: a metadata-only ALTER that takes no table
-- rewrite. Apply to production BEFORE the code that reads it ships.
ALTER TABLE "meetings" ADD COLUMN "agenda" text;
