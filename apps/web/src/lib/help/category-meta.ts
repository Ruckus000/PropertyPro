/**
 * Category → icon + chip tint for help UI chrome (modal header chip,
 * search-panel rows). Tints reuse existing status-token classes only —
 * this is the full extent of "category art" per the design spec.
 */
import {
  Banknote,
  Building2,
  CalendarDays,
  ClipboardList,
  CloudRain,
  FileSignature,
  FileText,
  Landmark,
  Megaphone,
  MessagesSquare,
  Rocket,
  Scale,
  ScrollText,
  ShieldCheck,
  Siren,
  TriangleAlert,
  Umbrella,
  UserCircle,
  Users,
  Vote,
  Wrench,
  Briefcase,
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

export const HELP_CATEGORY_META: Record<string, HelpCategoryMeta> = {
  account: { label: 'Account', icon: UserCircle, chipClass: NEUTRAL_CHIP },
  announcements: { label: 'Announcements', icon: Megaphone, chipClass: BRAND_CHIP },
  apartment: { label: 'Apartment', icon: Building2, chipClass: NEUTRAL_CHIP },
  audit: { label: 'Audit', icon: ClipboardList, chipClass: NEUTRAL_CHIP },
  compliance: { label: 'Compliance', icon: ShieldCheck, chipClass: BRAND_CHIP },
  contracts: { label: 'Contracts', icon: ScrollText, chipClass: NEUTRAL_CHIP },
  documents: { label: 'Documents', icon: FileText, chipClass: BRAND_CHIP },
  // Umbrella, not ShieldCheck — Compliance already owns the shield, and two
  // categories sharing an icon defeats at-a-glance scanning.
  insurance: { label: 'Insurance', icon: Umbrella, chipClass: BRAND_CHIP },
  elections: { label: 'Elections', icon: Vote, chipClass: BRAND_CHIP },
  emergency: { label: 'Emergency', icon: Siren, chipClass: DANGER_CHIP },
  esign: { label: 'E-Sign', icon: FileSignature, chipClass: NEUTRAL_CHIP },
  finance: { label: 'Finance', icon: Banknote, chipClass: SUCCESS_CHIP },
  forum: { label: 'Board forum', icon: MessagesSquare, chipClass: NEUTRAL_CHIP },
  'getting-started': { label: 'Getting started', icon: Rocket, chipClass: BRAND_CHIP },
  maintenance: { label: 'Maintenance', icon: Wrench, chipClass: WARNING_CHIP },
  meetings: { label: 'Meetings', icon: CalendarDays, chipClass: BRAND_CHIP },
  pm: { label: 'Property management', icon: Briefcase, chipClass: NEUTRAL_CHIP },
  reserves: { label: 'Reserves', icon: Landmark, chipClass: BRAND_CHIP },
  residents: { label: 'Residents', icon: Users, chipClass: NEUTRAL_CHIP },
  'storm-damage': { label: 'Storm damage', icon: CloudRain, chipClass: WARNING_CHIP },
  transparency: { label: 'Transparency', icon: Scale, chipClass: NEUTRAL_CHIP },
  violations: { label: 'Violations', icon: TriangleAlert, chipClass: WARNING_CHIP },
};

export function getHelpCategoryMeta(category: string): HelpCategoryMeta {
  const known = HELP_CATEGORY_META[category];
  if (known) return known;
  const label = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
  return { label, icon: FileText, chipClass: NEUTRAL_CHIP };
}
