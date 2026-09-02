import { useState } from 'react';
import {
  AlertTriangle,
  BriefcaseBusiness,
  Calendar,
  CreditCard,
  FileText,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Users,
  Vote,
} from 'lucide-react';
import {
  Box,
  Caption,
  Heading,
  HStack,
  NavRail,
  Paragraph,
  Text,
  VStack,
} from '@propertypro/design-system';

/**
 * NavRail is the authenticated app sidebar. Feed it `sections` (the flat
 * `items` / `groupSeparator` props are deprecated); each item carries an id, a
 * label and a lucide-shaped icon component, plus optional badge, href and
 * children. It is `h-full`, so the parent owns the height, and it sizes itself
 * to 260px expanded / 72px collapsed.
 */

const SECTIONS = [
  { label: null, items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '#' }] },
  {
    label: 'Community',
    items: [
      { id: 'documents', label: 'Documents', icon: FileText, href: '#', badge: 3, badgeVariant: 'warning' as const },
      { id: 'meetings', label: 'Meetings', icon: Calendar, href: '#' },
      { id: 'announcements', label: 'Announcements', icon: Megaphone, href: '#', badge: 5, badgeVariant: 'info' as const },
      { id: 'board', label: 'Board', icon: Vote, href: '#' },
    ],
  },
  {
    label: 'Management',
    items: [
      { id: 'payments', label: 'Payments', icon: CreditCard, href: '#' },
      { id: 'violations', label: 'Violations', icon: AlertTriangle, href: '#', badge: 2, badgeVariant: 'danger' as const },
    ],
  },
];

const NESTED_SECTIONS = [
  { label: null, items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '#' }] },
  {
    label: 'Community',
    items: [
      { id: 'documents', label: 'Documents', icon: FileText, href: '#', badge: 3, badgeVariant: 'warning' as const },
      {
        id: 'operations',
        label: 'Operations',
        icon: BriefcaseBusiness,
        href: '#',
        children: [
          { id: 'work-orders', label: 'Work orders', href: '#', badge: 4, badgeVariant: 'neutral' as const },
          { id: 'vendors', label: 'Vendors', href: '#' },
          { id: 'amenities', label: 'Amenities', href: '#' },
        ],
      },
    ],
  },
  {
    label: 'Admin',
    items: [
      { id: 'compliance', label: 'Compliance', icon: ShieldCheck, href: '#' },
      { id: 'residents', label: 'Residents', icon: Users, href: '#' },
    ],
  },
];

const Brand = ({ expanded }: { expanded: boolean }) => (
  <Box padding="sm" borderBottom>
    <HStack gap="sm" align="center">
      <Box
        background="var(--interactive-primary)"
        radius="md"
        width={32}
        height={32}
        display="flex"
        style={{ alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Text variant="bodySmall" weight="bold" color="var(--text-inverse)">
          SC
        </Text>
      </Box>
      {expanded && (
        <VStack gap={0} style={{ minWidth: 0 }}>
          <Text variant="bodySmall" weight="semibold" truncate>
            Sunset Condos
          </Text>
          <Caption>Professional · Miami</Caption>
        </VStack>
      )}
    </HStack>
  </Box>
);

const Profile = ({ expanded }: { expanded: boolean }) => (
  <Box padding="sm" borderTop>
    <HStack gap="sm" align="center">
      <Box
        background="var(--status-owner-bg)"
        border
        radius="full"
        width={32}
        height={32}
        display="flex"
        style={{ alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Text variant="caption" weight="semibold">
          EO
        </Text>
      </Box>
      {expanded && (
        <VStack gap={0} style={{ minWidth: 0 }}>
          <Text variant="bodySmall" weight="medium" truncate>
            Elena Ortiz
          </Text>
          <Caption>Property manager</Caption>
        </VStack>
      )}
    </HStack>
  </Box>
);

const PageArea = ({ title, blurb }: { title: string; blurb: string }) => (
  <Box background="page" padding="lg" style={{ flex: 1, minWidth: 0 }}>
    <VStack gap="md">
      <VStack gap="xs">
        <Caption transform="uppercase">Sunset Condos</Caption>
        <Heading level={1}>{title}</Heading>
        <Paragraph color="secondary">{blurb}</Paragraph>
      </VStack>
      <HStack gap="md">
        {(
          [
            ['94%', 'Compliance score'],
            ['3', 'Open violations'],
            ['18', 'Work orders'],
          ] as const
        ).map(([value, label]) => (
          <Box key={label} background="default" border radius="md" padding="md" style={{ flex: 1 }}>
            <VStack gap="xs">
              <Caption transform="uppercase">{label}</Caption>
              <Text variant="heading" size="lg">
                {value}
              </Text>
            </VStack>
          </Box>
        ))}
      </HStack>
    </VStack>
  </Box>
);

export const ExpandedSidebar = () => {
  const [activeView, setActiveView] = useState('documents');
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});

  return (
    <Box border radius="md" overflow="hidden" height={648} background="default">
      <HStack gap={0} align="stretch" style={{ height: '100%' }}>
        <NavRail
          sections={SECTIONS}
          collapsibleSections
          sectionOpen={sectionOpen}
          onSectionToggle={(label) =>
            setSectionOpen((open) => ({ ...open, [label]: !(open[label] ?? true) }))
          }
          activeView={activeView}
          onViewChange={setActiveView}
          expanded
          header={<Brand expanded />}
          footer={<Profile expanded />}
        />
        <PageArea
          title="Documents"
          blurb="Association records posted under §718.111(12)(g). Three documents are inside the 30-day window."
        />
      </HStack>
    </Box>
  );
};

export const CollapsedRail = () => {
  const [activeView, setActiveView] = useState('violations');

  return (
    <Box border radius="md" overflow="hidden" height={648} background="default">
      <HStack gap={0} align="stretch" style={{ height: '100%' }}>
        <NavRail
          sections={SECTIONS}
          activeView={activeView}
          onViewChange={setActiveView}
          expanded={false}
          onToggle={() => undefined}
          header={<Brand expanded={false} />}
          footer={<Profile expanded={false} />}
        />
        <PageArea
          title="Violations"
          blurb="Collapsed to 72px: labels drop away and an unread badge becomes a dot on the icon. Two violations are awaiting a hearing date."
        />
      </HStack>
    </Box>
  );
};

export const NestedSubItems = () => {
  const [activeView, setActiveView] = useState('work-orders');
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});

  return (
    <Box border radius="md" overflow="hidden" height={648} background="default">
      <HStack gap={0} align="stretch" style={{ height: '100%' }}>
        <NavRail
          sections={NESTED_SECTIONS}
          collapsibleSections
          sectionOpen={sectionOpen}
          onSectionToggle={(label) =>
            setSectionOpen((open) => ({ ...open, [label]: !(open[label] ?? true) }))
          }
          activeView={activeView}
          onViewChange={setActiveView}
          expanded
          header={<Brand expanded />}
          footer={<Profile expanded />}
        />
        <PageArea
          title="Work orders"
          blurb="A parent with children expands in place whenever one of its sub-items is the active view, and the active child keeps its own highlight."
        />
      </HStack>
    </Box>
  );
};
