/** P3-47: Add branding JSONB column to communities for white-label settings.
 *
 * Shape: { primaryColor?: string, secondaryColor?: string, logoPath?: string }
 *
 * The existing logo_path text column is kept during the migration window.
 * When branding->>'logoPath' is non-null it takes precedence over logo_path.
 */
ALTER TABLE "communities"
  ADD COLUMN IF NOT EXISTS "branding" jsonb;
