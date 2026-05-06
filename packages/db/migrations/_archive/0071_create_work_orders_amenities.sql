-- WS-69: Work orders, vendors, amenities, and reservations schema.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE vendors (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT vendors_specialties_is_array CHECK (jsonb_typeof(specialties) = 'array')
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;

CREATE TABLE work_orders (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  unit_id BIGINT REFERENCES units(id) ON DELETE SET NULL,
  vendor_id BIGINT REFERENCES vendors(id) ON DELETE SET NULL,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'created',
  sla_response_hours INTEGER,
  sla_completion_hours INTEGER,
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT work_orders_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  CONSTRAINT work_orders_status_check CHECK (status IN ('created', 'assigned', 'in_progress', 'completed', 'closed')),
  CONSTRAINT work_orders_sla_response_positive CHECK (sla_response_hours IS NULL OR sla_response_hours > 0),
  CONSTRAINT work_orders_sla_completion_positive CHECK (sla_completion_hours IS NULL OR sla_completion_hours > 0)
);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE ROW LEVEL SECURITY;

CREATE TABLE amenities (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  capacity INTEGER,
  is_bookable BOOLEAN NOT NULL DEFAULT TRUE,
  booking_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT amenities_capacity_positive CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT amenities_booking_rules_is_object CHECK (jsonb_typeof(booking_rules) = 'object')
);

ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities FORCE ROW LEVEL SECURITY;

CREATE TABLE amenity_reservations (
  id BIGSERIAL PRIMARY KEY,
  community_id BIGINT NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  amenity_id BIGINT NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_id BIGINT REFERENCES units(id) ON DELETE SET NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT amenity_reservations_status_check CHECK (status IN ('confirmed', 'cancelled')),
  CONSTRAINT amenity_reservations_time_range_check CHECK (end_time > start_time)
);

ALTER TABLE amenity_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenity_reservations FORCE ROW LEVEL SECURITY;

ALTER TABLE amenity_reservations
  ADD CONSTRAINT no_overlapping_reservations
  EXCLUDE USING gist (
    amenity_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
  WHERE (status = 'confirmed' AND deleted_at IS NULL);

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT unnest(ARRAY[
      'vendors',
      'work_orders',
      'amenities',
      'amenity_reservations'
    ]::text[])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_select" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_insert" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_update" ON "public".%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "pp_tenant_delete" ON "public".%I', table_name);

    EXECUTE format(
      'CREATE POLICY "pp_tenant_select" ON "public".%I FOR SELECT USING ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_insert" ON "public".%I FOR INSERT WITH CHECK ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_update" ON "public".%I FOR UPDATE USING ("public"."pp_rls_can_access_community"("community_id")) WITH CHECK ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY "pp_tenant_delete" ON "public".%I FOR DELETE USING ("public"."pp_rls_can_access_community"("community_id"))',
      table_name
    );

    EXECUTE format('DROP TRIGGER IF EXISTS "pp_rls_enforce_tenant_scope" ON "public".%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER "pp_rls_enforce_tenant_scope" BEFORE INSERT OR UPDATE ON "public".%I FOR EACH ROW EXECUTE FUNCTION "public"."pp_rls_enforce_tenant_community_id"()',
      table_name
    );
  END LOOP;
END $$;

CREATE INDEX idx_vendors_community_active
  ON vendors(community_id, is_active, name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_work_orders_community_status
  ON work_orders(community_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_work_orders_community_vendor
  ON work_orders(community_id, vendor_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_amenities_community_bookable
  ON amenities(community_id, is_bookable, name)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_amenity_reservations_community_schedule
  ON amenity_reservations(community_id, amenity_id, start_time)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_amenity_reservations_community_user
  ON amenity_reservations(community_id, user_id, start_time DESC)
  WHERE deleted_at IS NULL;
