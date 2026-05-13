-- Add free-text unit label to maintenance requests. Resident-supplied
-- apartment/unit identifier (e.g. "4B", "Apt 312") shown to property
-- managers receiving the request. Decoupled from `unit_id` FK because
-- the `units` table is not guaranteed to be populated for every community
-- in onboarding. Nullable so existing rows remain valid; API requires it
-- on new inserts.
ALTER TABLE "maintenance_requests" ADD COLUMN "unit_label" text;
