-- M2: Apartment rent obligations/payments and lease invariants.
-- Incremental extension of the existing leases-based rent model.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS rent_obligations (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  lease_id BIGINT NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  amount_cents BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT rent_obligations_amount_positive CHECK (amount_cents > 0),
  CONSTRAINT rent_obligations_period_order CHECK (period_end >= period_start),
  CONSTRAINT rent_obligations_status_check CHECK (
    status IN ('pending', 'paid', 'partially_paid', 'overdue', 'waived')
  ),
  CONSTRAINT rent_obligations_unique_lease_period UNIQUE (lease_id, period_start)
);

ALTER TABLE rent_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_obligations FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS rent_payments (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  lease_id BIGINT NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
  obligation_id BIGINT REFERENCES rent_obligations(id) ON DELETE SET NULL,
  unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  resident_id UUID REFERENCES users(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  external_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT rent_payments_amount_positive CHECK (amount_cents > 0)
);

ALTER TABLE rent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_tenant_select" ON rent_obligations;
DROP POLICY IF EXISTS "pp_tenant_insert" ON rent_obligations;
DROP POLICY IF EXISTS "pp_tenant_update" ON rent_obligations;
DROP POLICY IF EXISTS "pp_tenant_delete" ON rent_obligations;
DROP POLICY IF EXISTS "pp_rent_obligations_insert" ON rent_obligations;
DROP POLICY IF EXISTS "pp_rent_obligations_update" ON rent_obligations;
DROP POLICY IF EXISTS "pp_rent_obligations_delete" ON rent_obligations;

CREATE POLICY "pp_tenant_select"
ON rent_obligations
FOR SELECT
USING ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_rent_obligations_insert"
ON rent_obligations
FOR INSERT
WITH CHECK (
  "public"."pp_rls_can_access_community"(community_id)
  AND "public"."pp_rls_can_read_audit_log"(community_id)
);

CREATE POLICY "pp_rent_obligations_update"
ON rent_obligations
FOR UPDATE
USING (
  "public"."pp_rls_can_access_community"(community_id)
  AND "public"."pp_rls_can_read_audit_log"(community_id)
)
WITH CHECK (
  "public"."pp_rls_can_access_community"(community_id)
  AND "public"."pp_rls_can_read_audit_log"(community_id)
);

CREATE POLICY "pp_rent_obligations_delete"
ON rent_obligations
FOR DELETE
USING (
  "public"."pp_rls_can_access_community"(community_id)
  AND "public"."pp_rls_can_read_audit_log"(community_id)
);

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON rent_obligations;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON rent_obligations
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

DROP POLICY IF EXISTS "pp_tenant_select" ON rent_payments;
DROP POLICY IF EXISTS "pp_tenant_insert" ON rent_payments;
DROP POLICY IF EXISTS "pp_tenant_update" ON rent_payments;
DROP POLICY IF EXISTS "pp_tenant_delete" ON rent_payments;
DROP POLICY IF EXISTS "pp_rent_payments_insert" ON rent_payments;
DROP POLICY IF EXISTS "pp_rent_payments_update" ON rent_payments;
DROP POLICY IF EXISTS "pp_rent_payments_delete" ON rent_payments;

CREATE POLICY "pp_tenant_select"
ON rent_payments
FOR SELECT
USING ("public"."pp_rls_can_access_community"(community_id));

CREATE POLICY "pp_rent_payments_insert"
ON rent_payments
FOR INSERT
WITH CHECK (
  "public"."pp_rls_can_access_community"(community_id)
  AND "public"."pp_rls_can_read_audit_log"(community_id)
);

CREATE POLICY "pp_rent_payments_update"
ON rent_payments
FOR UPDATE
USING (
  "public"."pp_rls_can_access_community"(community_id)
  AND "public"."pp_rls_can_read_audit_log"(community_id)
)
WITH CHECK (
  "public"."pp_rls_can_access_community"(community_id)
  AND "public"."pp_rls_can_read_audit_log"(community_id)
);

CREATE POLICY "pp_rent_payments_delete"
ON rent_payments
FOR DELETE
USING (
  "public"."pp_rls_can_access_community"(community_id)
  AND "public"."pp_rls_can_read_audit_log"(community_id)
);

DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON rent_payments;
CREATE TRIGGER "pp_rls_enforce_tenant_scope"
  BEFORE INSERT OR UPDATE ON rent_payments
  FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"();

-- Lease validity and overlap invariants.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leases_start_first_of_month_check'
      AND conrelid = 'leases'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM leases
      WHERE start_date IS DISTINCT FROM date_trunc('month', start_date)::date
    ) THEN
      RAISE NOTICE 'Skipping leases_start_first_of_month_check because existing lease rows violate it';
    ELSE
      ALTER TABLE leases
        ADD CONSTRAINT leases_start_first_of_month_check
        CHECK (date_trunc('month', start_date)::date = start_date);
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leases_end_after_start_check'
      AND conrelid = 'leases'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM leases
      WHERE end_date IS NOT NULL AND end_date <= start_date
    ) THEN
      RAISE NOTICE 'Skipping leases_end_after_start_check because existing lease rows violate it';
    ELSE
      ALTER TABLE leases
        ADD CONSTRAINT leases_end_after_start_check
        CHECK (end_date IS NULL OR end_date > start_date);
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leases_no_overlap_per_unit'
      AND conrelid = 'leases'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM leases l1
      JOIN leases l2
        ON l1.unit_id = l2.unit_id
       AND l1.id < l2.id
       AND l1.deleted_at IS NULL
       AND l2.deleted_at IS NULL
       AND daterange(l1.start_date, COALESCE(l1.end_date + 1, 'infinity'::date), '[)')
         && daterange(l2.start_date, COALESCE(l2.end_date + 1, 'infinity'::date), '[)')
    ) THEN
      RAISE NOTICE 'Skipping leases_no_overlap_per_unit because existing lease rows violate it';
    ELSE
      ALTER TABLE leases
        ADD CONSTRAINT leases_no_overlap_per_unit
        EXCLUDE USING gist (
          unit_id WITH =,
          daterange(start_date, COALESCE(end_date + 1, 'infinity'::date), '[)') WITH &&
        )
        WHERE (deleted_at IS NULL);
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION pp_enforce_lease_renewal_continuity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prev_lease leases%ROWTYPE;
BEGIN
  IF NEW.previous_lease_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO prev_lease
  FROM leases
  WHERE id = NEW.previous_lease_id;

  IF prev_lease.id IS NULL THEN
    RAISE EXCEPTION 'previous_lease_id % does not exist', NEW.previous_lease_id;
  END IF;

  IF prev_lease.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'previous_lease_id % points to deleted lease', NEW.previous_lease_id;
  END IF;

  IF prev_lease.community_id <> NEW.community_id OR prev_lease.unit_id <> NEW.unit_id THEN
    RAISE EXCEPTION 'renewal must reference prior lease in same community and unit';
  END IF;

  IF prev_lease.end_date IS NULL THEN
    RAISE EXCEPTION 'previous lease must have end_date for renewal continuity';
  END IF;

  IF NEW.start_date <> (prev_lease.end_date + 1) THEN
    RAISE EXCEPTION 'renewal lease start_date must be previous end_date + 1 day';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leases_enforce_renewal_continuity ON leases;
CREATE TRIGGER leases_enforce_renewal_continuity
  BEFORE INSERT OR UPDATE ON leases
  FOR EACH ROW
  EXECUTE FUNCTION pp_enforce_lease_renewal_continuity();

-- Resolve rent source-of-truth drift:
-- leases.rent_amount is authoritative; units.rent_amount becomes derived.
CREATE OR REPLACE FUNCTION pp_sync_unit_rent_amount_from_lease(target_unit_id BIGINT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  active_rent NUMERIC(10, 2);
BEGIN
  SELECT l.rent_amount
  INTO active_rent
  FROM leases l
  WHERE l.unit_id = target_unit_id
    AND l.deleted_at IS NULL
    AND l.status = 'active'
    AND l.start_date <= CURRENT_DATE
    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE)
  ORDER BY l.start_date DESC, l.id DESC
  LIMIT 1;

  UPDATE units
  SET rent_amount = active_rent,
      updated_at = NOW()
  WHERE id = target_unit_id;
END;
$$;

CREATE OR REPLACE FUNCTION pp_leases_sync_unit_rent_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM pp_sync_unit_rent_amount_from_lease(OLD.unit_id);
    RETURN OLD;
  END IF;

  PERFORM pp_sync_unit_rent_amount_from_lease(NEW.unit_id);

  IF TG_OP = 'UPDATE' AND NEW.unit_id <> OLD.unit_id THEN
    PERFORM pp_sync_unit_rent_amount_from_lease(OLD.unit_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leases_sync_unit_rent_amount ON leases;
CREATE TRIGGER leases_sync_unit_rent_amount
  AFTER INSERT OR UPDATE OF unit_id, start_date, end_date, rent_amount, status, deleted_at OR DELETE
  ON leases
  FOR EACH ROW
  EXECUTE FUNCTION pp_leases_sync_unit_rent_amount();

CREATE OR REPLACE FUNCTION pp_block_direct_unit_rent_amount_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rent_amount IS DISTINCT FROM OLD.rent_amount AND pg_trigger_depth() = 0 THEN
    RAISE EXCEPTION 'units.rent_amount is derived from leases.rent_amount; update the lease instead';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS units_block_direct_rent_amount_write ON units;
CREATE TRIGGER units_block_direct_rent_amount_write
  BEFORE UPDATE OF rent_amount ON units
  FOR EACH ROW
  EXECUTE FUNCTION pp_block_direct_unit_rent_amount_write();

-- Backfill existing units from active leases so drift converges at migration time.
UPDATE units u
SET rent_amount = derived.rent_amount
FROM (
  SELECT DISTINCT ON (l.unit_id)
    l.unit_id,
    l.rent_amount
  FROM leases l
  WHERE l.deleted_at IS NULL
    AND l.status = 'active'
    AND l.start_date <= CURRENT_DATE
    AND (l.end_date IS NULL OR l.end_date >= CURRENT_DATE)
  ORDER BY l.unit_id, l.start_date DESC, l.id DESC
) AS derived
WHERE derived.unit_id = u.id;

CREATE INDEX IF NOT EXISTS idx_rent_obligations_community_status_due
  ON rent_obligations(community_id, status, due_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rent_obligations_lease_period
  ON rent_obligations(lease_id, period_start DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rent_payments_community_payment_date
  ON rent_payments(community_id, payment_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rent_payments_obligation
  ON rent_payments(obligation_id)
  WHERE deleted_at IS NULL;
