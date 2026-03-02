/**
 * CommunityTheme — fully resolved theme, no optional fields.
 * Defaults are always applied before this type is used.
 */
export interface CommunityTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
  logoUrl: string | null;
  communityName: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
}
