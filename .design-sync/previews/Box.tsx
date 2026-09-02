import { ArrowUpRight, FileText, Gavel, Wrench } from 'lucide-react';
import {
  Box,
  Caption,
  Code,
  Heading,
  HStack,
  Paragraph,
  Text,
  VStack,
} from '@propertypro/design-system';

/**
 * Box is the foundational layout primitive. Every prop resolves through the
 * token objects and lands as an inline style — `padding="lg"` is
 * semanticSpacing.inset.lg, `radius="md"` is 10px, `background="subtle"` is
 * var(--surface-subtle). It is polymorphic: `as` swaps the rendered element
 * while keeping the whole styling API.
 */

export const ComplianceCard = () => (
  <Box
    background="default"
    border
    radius="md"
    shadow="sm"
    overflow="hidden"
    maxWidth={620}
  >
    <Box padding="lg" borderBottom background="subtle">
      <HStack justify="space-between" align="center" gap="md">
        <VStack gap="xs">
          <Caption transform="uppercase">Statutory deadline</Caption>
          <Heading level={3}>Milestone inspection</Heading>
        </VStack>
        <Box
          background="var(--status-danger-bg)"
          border="error"
          radius="full"
          paddingX="sm"
          paddingY="xs"
        >
          <Text variant="caption" color="var(--status-danger)" weight="bold" transform="uppercase">
            Overdue
          </Text>
        </Box>
      </HStack>
    </Box>

    <Box padding="lg">
      <VStack gap="md">
        <Paragraph color="secondary">
          Buildings three storeys or taller and 30 years old or older require a
          milestone inspection. Sunset Condos was last inspected in March 2019.
        </Paragraph>
        <HStack gap="lg">
          <VStack gap="xs">
            <Caption transform="uppercase">Due</Caption>
            <Text weight="medium">31 December 2024</Text>
          </VStack>
          <VStack gap="xs">
            <Caption transform="uppercase">Days late</Caption>
            <Text weight="medium" color="var(--status-danger)">
              214
            </Text>
          </VStack>
          <VStack gap="xs">
            <Caption transform="uppercase">Buildings</Caption>
            <Text weight="medium">2 of 3 affected</Text>
          </VStack>
        </HStack>
      </VStack>
    </Box>

    <Box padding="md" borderTop background="subtle">
      <Caption>Recorded in compliance_audit_log · reviewed by Elena Ortiz</Caption>
    </Box>
  </Box>
);

export const SurfacesRadiiElevation = () => (
  <Box background="page" border radius="md" padding="md" style={{ maxWidth: 850 }}>
    <VStack gap="lg">
      <VStack gap="sm">
        <Caption transform="uppercase">background — the surface ladder, on the page ground</Caption>
        <HStack gap="md" wrap>
          {(
            [
              ['page', '--surface-page'],
              ['default', '--surface-card'],
              ['subtle', '--surface-subtle'],
              ['muted', '--surface-muted'],
              ['sunken', '--surface-sunken'],
            ] as const
          ).map(([surface, token]) => (
            <Box
              key={surface}
              background={surface}
              border
              radius="md"
              padding="md"
              width={146}
              height={84}
            >
              <VStack gap="xs">
                <Text variant="bodySmall" weight="medium">
                  {surface}
                </Text>
                <Code color="tertiary">{token}</Code>
              </VStack>
            </Box>
          ))}
        </HStack>
      </VStack>

      <VStack gap="sm">
        <Caption transform="uppercase">radius — 0 · 6 · 10 · 16 · 20 · 24 · pill</Caption>
        <HStack gap="md" wrap align="center">
          {(
            [
              ['none', '0'],
              ['sm', '6'],
              ['md', '10'],
              ['lg', '16'],
              ['xl', '20'],
              ['2xl', '24'],
              ['full', 'pill'],
            ] as const
          ).map(([radius, px]) => (
            <Box
              key={radius}
              background="muted"
              border="strong"
              radius={radius}
              padding="md"
              width={96}
              height={72}
            >
              <VStack gap="xs">
                <Text variant="bodySmall" weight="medium" align="center">
                  {radius}
                </Text>
                <Caption align="center">{px}</Caption>
              </VStack>
            </Box>
          ))}
        </HStack>
      </VStack>

      <VStack gap="sm">
        <Caption transform="uppercase">
          shadow — borderless, so the elevation is the only signal
        </Caption>
        <HStack gap="xl" wrap align="center">
          {(
            [
              ['none', 'E0 · flat card'],
              ['sm', 'E1 · hover lift'],
              ['md', 'E2 · dropdown'],
              ['lg', 'E3 · modal'],
            ] as const
          ).map(([shadow, level]) => (
            <Box
              key={shadow}
              background="default"
              radius="md"
              shadow={shadow}
              padding="md"
              width={160}
              height={80}
            >
              <VStack gap="xs">
                <Text variant="bodySmall" weight="medium">
                  shadow=&quot;{shadow}&quot;
                </Text>
                <Caption>{level}</Caption>
              </VStack>
            </Box>
          ))}
        </HStack>
      </VStack>
    </VStack>
  </Box>
);

export const PolymorphicAs = () => (
  <Box as="section" background="page" border radius="md" padding="lg" maxWidth={780}>
    <VStack gap="md">
      <VStack gap="xs">
        <Heading level={4}>Quick actions</Heading>
        <Paragraph color="secondary">
          The same Box styling API renders whichever element the markup needs —
          the wrapper here is <Code>as=&quot;section&quot;</Code>.
        </Paragraph>
      </VStack>

      <Box as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <HStack gap="md" wrap>
          {(
            [
              { icon: FileText, label: 'Post a document', tag: 'as="a"', meta: '30-day clock' },
              { icon: Gavel, label: 'Issue a violation', tag: 'as="a"', meta: '14-day notice' },
              { icon: Wrench, label: 'Open a work order', tag: 'as="a"', meta: 'Assign a vendor' },
            ] as const
          ).map(({ icon: Icon, label, tag, meta }) => (
            <Box as="li" key={label} style={{ listStyle: 'none' }}>
              <Box
                as="a"
                href="#"
                background="default"
                border
                radius="md"
                padding="md"
                shadow="sm"
                width={220}
                cursor="pointer"
                transition
                style={{ display: 'block', textDecoration: 'none' }}
              >
                <VStack gap="xs">
                  <HStack justify="space-between" align="center">
                    <Icon size={18} color="var(--interactive-primary)" aria-hidden="true" />
                    <ArrowUpRight size={16} color="var(--text-tertiary)" aria-hidden="true" />
                  </HStack>
                  <Text weight="medium">{label}</Text>
                  <Caption>{meta}</Caption>
                  <Code color="tertiary">{tag}</Code>
                </VStack>
              </Box>
            </Box>
          ))}
        </HStack>
      </Box>

      <Box as="article" background="default" border radius="md" padding="md">
        <VStack gap="xs">
          <Code color="tertiary">as=&quot;article&quot;</Code>
          <Text weight="medium">Hurricane shutter installation approved</Text>
          <Caption>ARC-2026-0042 · unit 412-B · 13 March 2026</Caption>
        </VStack>
      </Box>
    </VStack>
  </Box>
);

export const SpacingAndBorders = () => (
  <VStack gap="lg" style={{ maxWidth: 820 }}>
    <VStack gap="sm">
      <Caption transform="uppercase">padding — the inset scale</Caption>
      <HStack gap="md" wrap align="flex-start">
        {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((pad) => (
          <Box key={pad} background="subtle" border radius="md" padding={pad}>
            <Box background="default" border radius="sm" padding="xs">
              <Code color="tertiary">padding=&quot;{pad}&quot;</Code>
            </Box>
          </Box>
        ))}
      </HStack>
    </VStack>

    <VStack gap="sm">
      <Caption transform="uppercase">border colour &amp; per-side edges</Caption>
      <HStack gap="md" wrap align="stretch">
        <Box background="default" border="subtle" radius="md" padding="md" width={150}>
          <Code color="tertiary">border=&quot;subtle&quot;</Code>
        </Box>
        <Box background="default" border radius="md" padding="md" width={150}>
          <Code color="tertiary">border (default)</Code>
        </Box>
        <Box background="default" border="strong" radius="md" padding="md" width={150}>
          <Code color="tertiary">border=&quot;strong&quot;</Code>
        </Box>
        <Box background="default" border="error" radius="md" padding="md" width={150}>
          <Code color="var(--status-danger)">border=&quot;error&quot;</Code>
        </Box>
      </HStack>
      <Box background="default" border radius="md" overflow="hidden" width={420}>
        <Box padding="sm" borderBottom>
          <Code color="tertiary">borderBottom — a list row divider</Code>
        </Box>
        <Box padding="sm" borderBottom>
          <Text variant="bodySmall">Declaration of Condominium</Text>
        </Box>
        <Box padding="sm" borderLeft="focus" borderWidth={3}>
          <Text variant="bodySmall">borderLeft=&quot;focus&quot; borderWidth=&#123;3&#125;</Text>
        </Box>
      </Box>
    </VStack>
  </VStack>
);
