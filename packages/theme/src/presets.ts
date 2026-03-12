export interface PresetBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontHeading: string;
  fontBody: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'modern-blue',
    name: 'Modern Blue',
    description: 'Clean and professional with a blue accent',
    primaryColor: '#2563EB',
    secondaryColor: '#6B7280',
    accentColor: '#DBEAFE',
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  {
    id: 'warm-earth',
    name: 'Warm Earth',
    description: 'Inviting earth tones with a serif touch',
    primaryColor: '#92400E',
    secondaryColor: '#78716C',
    accentColor: '#FEF3C7',
    fontHeading: 'Merriweather',
    fontBody: 'Source Sans 3',
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    description: 'Coastal teal palette with modern typography',
    primaryColor: '#0D9488',
    secondaryColor: '#64748B',
    accentColor: '#CCFBF1',
    fontHeading: 'Plus Jakarta Sans',
    fontBody: 'DM Sans',
  },
  {
    id: 'professional-slate',
    name: 'Professional Slate',
    description: 'Understated dark palette for a corporate feel',
    primaryColor: '#334155',
    secondaryColor: '#64748B',
    accentColor: '#E2E8F0',
    fontHeading: 'Outfit',
    fontBody: 'Work Sans',
  },
  {
    id: 'sunset-coral',
    name: 'Sunset Coral',
    description: 'Warm and approachable with a pop of coral',
    primaryColor: '#DC2626',
    secondaryColor: '#78716C',
    accentColor: '#FEE2E2',
    fontHeading: 'Poppins',
    fontBody: 'Nunito',
  },
  {
    id: 'garden-green',
    name: 'Garden Green',
    description: 'Fresh and natural with green accents',
    primaryColor: '#059669',
    secondaryColor: '#6B7280',
    accentColor: '#D1FAE5',
    fontHeading: 'Urbanist',
    fontBody: 'Figtree',
  },
];

export function presetToBranding(preset: ThemePreset): PresetBranding {
  return {
    primaryColor: preset.primaryColor,
    secondaryColor: preset.secondaryColor,
    accentColor: preset.accentColor,
    fontHeading: preset.fontHeading,
    fontBody: preset.fontBody,
  };
}
