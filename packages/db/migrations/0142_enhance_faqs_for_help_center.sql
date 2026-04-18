-- Add optional help center metadata to FAQs.
-- NULL category preserves backwards compatibility for existing rows.
-- NULL role_visibility means visible to all roles.

ALTER TABLE faqs
  ADD COLUMN category text,
  ADD COLUMN role_visibility text[];

COMMENT ON COLUMN faqs.category IS 'Optional help center category label';
COMMENT ON COLUMN faqs.role_visibility IS 'Optional array of role keys allowed to view this FAQ';
