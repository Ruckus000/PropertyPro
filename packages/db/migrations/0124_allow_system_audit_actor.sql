-- Allow append-only audit rows to represent system-generated events
-- that do not have a human user actor.

ALTER TABLE "compliance_audit_log"
ALTER COLUMN "user_id" DROP NOT NULL;
