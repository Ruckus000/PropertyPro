-- P1-27c: DB-native append-only enforcement for compliance_audit_log.
-- Blocks UPDATE/DELETE at the database layer, even outside scoped-client guards.

CREATE OR REPLACE FUNCTION "public"."prevent_compliance_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'compliance_audit_log is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "compliance_audit_log_append_only_guard" ON "public"."compliance_audit_log";
--> statement-breakpoint

CREATE TRIGGER "compliance_audit_log_append_only_guard"
BEFORE UPDATE OR DELETE ON "public"."compliance_audit_log"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_compliance_audit_log_mutation"();

-- Rollback (manual):
-- DROP TRIGGER IF EXISTS "compliance_audit_log_append_only_guard" ON "public"."compliance_audit_log";
-- DROP FUNCTION IF EXISTS "public"."prevent_compliance_audit_log_mutation"();
