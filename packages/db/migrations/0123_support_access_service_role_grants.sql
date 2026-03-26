-- Support access writes run through the Supabase service role.
-- The initial migration created the tables but missed sequence grants,
-- which blocks inserts through PostgREST-backed admin clients.

GRANT SELECT, INSERT, UPDATE ON support_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE ON support_consent_grants TO service_role;
GRANT SELECT, INSERT ON support_access_log TO service_role;

GRANT USAGE, SELECT ON SEQUENCE support_sessions_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE support_consent_grants_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE support_access_log_id_seq TO service_role;
