-- Add category and role visibility columns to existing faqs table.
-- Both nullable for backwards compatibility with existing FAQs.
-- NULL category = uncategorized. NULL role_visibility = visible to all roles.

ALTER TABLE faqs ADD COLUMN category text;
ALTER TABLE faqs ADD COLUMN role_visibility text[];

COMMENT ON COLUMN faqs.category IS 'Optional grouping label for help center display';
COMMENT ON COLUMN faqs.role_visibility IS 'Array of community roles that can see this FAQ. NULL = all roles.';
