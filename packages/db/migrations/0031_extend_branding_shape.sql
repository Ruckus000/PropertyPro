-- Set sensible defaults for all existing rows that have branding
UPDATE communities
SET branding = branding
  || jsonb_build_object(
    'accentColor', '#DBEAFE',
    'fontHeading', 'Inter',
    'fontBody', 'Inter'
  )
WHERE branding IS NOT NULL
  AND branding != 'null'::jsonb;
