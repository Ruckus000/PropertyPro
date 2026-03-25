-- 0117_visitor_user_fk_alignment.sql
-- Align visitor upgrade foreign keys with the application users table.

ALTER TABLE visitor_log
  DROP CONSTRAINT IF EXISTS visitor_log_revoked_by_user_id_fkey;

ALTER TABLE visitor_log
  ADD CONSTRAINT visitor_log_revoked_by_user_id_fkey
  FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE denied_visitors
  DROP CONSTRAINT IF EXISTS denied_visitors_denied_by_user_id_fkey;

ALTER TABLE denied_visitors
  ADD CONSTRAINT denied_visitors_denied_by_user_id_fkey
  FOREIGN KEY (denied_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
