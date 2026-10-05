/**
 * Category → icon + chip tint for help UI chrome (modal header chip,
 * search-panel rows). Tints reuse existing status-token classes only —
 * this is the full extent of "category art" per the design spec.
 */
import {
  Banknote,
  Briefcase,
  Building2,
  CalendarDays,
  FileSignature,
  FileText,
  Globe,
  Megaphone,
  Rocket,
  ScrollText,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Umbrella,
  UserCircle,
  Users,
  Vote,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export interface HelpCategoryMeta {
  label: string;
  icon: LucideIcon;
  chipClass: string;
}

const NEUTRAL_CHIP = 'bg-surface-muted text-content-secondary border-edge';
const BRAND_CHIP = 'bg-status-brand-subtle text-status-brand border-status-brand-border';
const WARNING_CHIP = 'bg-status-warning-subtle text-status-warning border-status-warning-border';
const DANGER_CHIP = 'bg-status-danger-subtle text-status-danger border-status-danger-border';
const SUCCESS_CHIP = 'bg-status-success-subtle text-status-success border-status-success-border';

/**
 * Help topics, in the order the Help Center sidebar and home list them.
 * Each is a directory under content/help/<section>/ and a /help/<category> URL.
 */
export const HELP_CATEGORY_ORDER: readonly string[] = [
  'getting-started',
  'documents',
  'meetings',
  'announcements',
  'compliance',
  'payments',
  'maintenance',
  'violations',
  'board',
  'esign',
  'residents',
  'leases',
  'apartment',
  'building',
  'emergency',
  'website',
  'pm',
  'account',
];

export const HELP_CATEGORY_META: Record<string, HelpCategoryMeta> = {
  'getting-started': { label: 'Getting started', icon: Rocket, chipClass: BRAND_CHIP },
  documents: { label: 'Documents', icon: FileText, chipClass: BRAND_CHIP },
  meetings: { label: 'Meetings', icon: CalendarDays, chipClass: BRAND_CHIP },
  announcements: { label: 'Announcements', icon: Megaphone, chipClass: BRAND_CHIP },
  compliance: { label: 'Compliance', icon: ShieldCheck, chipClass: BRAND_CHIP },
  payments: { label: 'Payments and assessments', icon: Banknote, chipClass: SUCCESS_CHIP },
  maintenance: { label: 'Maintenance', icon: Wrench, chipClass: WARNING_CHIP },
  violations: { label: 'Violations and ARC', icon: TriangleAlert, chipClass: WARNING_CHIP },
  board: { label: 'Board, polls, and elections', icon: Vote, chipClass: BRAND_CHIP },
  esign: { label: 'E-sign', icon: FileSignature, chipClass: NEUTRAL_CHIP },
  residents: { label: 'Residents and units', icon: Users, chipClass: NEUTRAL_CHIP },
  leases: { label: 'Leases', icon: ScrollText, chipClass: NEUTRAL_CHIP },
  apartment: { label: 'Packages and visitors', icon: Building2, chipClass: NEUTRAL_CHIP },
  // Umbrella, not ShieldCheck — Compliance already owns the shield, and two
  // categories sharing an icon defeats at-a-glance scanning.
  building: { label: 'Insurance, reserves, and storms', icon: Umbrella, chipClass: BRAND_CHIP },
  emergency: { label: 'Emergency alerts', icon: Siren, chipClass: DANGER_CHIP },
  website: { label: 'Website and records', icon: Globe, chipClass: NEUTRAL_CHIP },
  pm: { label: 'Portfolio', icon: Briefcase, chipClass: NEUTRAL_CHIP },
  account: { label: 'Your account', icon: UserCircle, chipClass: NEUTRAL_CHIP },
};

export function getHelpCategoryMeta(category: string): HelpCategoryMeta {
  const known = HELP_CATEGORY_META[category];
  if (known) return known;
  const label = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
  return { label, icon: FileText, chipClass: NEUTRAL_CHIP };
}
