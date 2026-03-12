-- Add FORCE RLS to site_blocks for consistency with all other tenant tables.
-- Without FORCE, the table owner (postgres) can bypass RLS policies.
ALTER TABLE site_blocks FORCE ROW LEVEL SECURITY;
