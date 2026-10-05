-- leases_v3_validate_checks
--
-- WHY: leases_v3_expand added these three CHECKs NOT VALID, so they bound every
-- new write at once while existing production rows waited to be inspected.
-- Inspected 2026-10-05: 0 of 15 leases violate any of them. VALIDATE scans the
-- table under SHARE UPDATE EXCLUSIVE only; reads and writes continue. If a
-- violating row exists the statement fails and nothing changes.
ALTER TABLE "leases" VALIDATE CONSTRAINT "leases_end_after_start";--> statement-breakpoint
ALTER TABLE "leases" VALIDATE CONSTRAINT "leases_rent_not_negative";--> statement-breakpoint
ALTER TABLE "leases" VALIDATE CONSTRAINT "leases_zero_rent_needs_reason";
