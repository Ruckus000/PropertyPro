import type { ReactNode } from 'react';
import { Box, HStack, Text, VStack } from '@propertypro/design-system';

/**
 * Text is the typography primitive. It is NOT Tailwind-driven: every style comes
 * from the token objects in packages/ui/src/tokens, applied as inline styles.
 *
 * Two axes are easy to get wrong:
 *  - `size` only bites when the resolved variant is `heading`. On body / caption /
 *    mono it is silently ignored, so don't reach for it there.
 *  - `color` takes a semantic key (primary, secondary, tertiary, brand, link, …)
 *    or any raw CSS colour string, which is how a status colour gets in.
 */

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <HStack gap="md" align="baseline">
    <Box width={132} style={{ flexShrink: 0 }}>
      <Text variant="mono" color="tertiary">
        {label}
      </Text>
    </Box>
    <Box style={{ minWidth: 0 }}>{children}</Box>
  </HStack>
);

export const TypeScale = () => (
  <Box
    background="default"
    border
    radius="md"
    padding="lg"
    shadow="sm"
    maxWidth={780}
  >
    <VStack gap="md">
      <Row label='variant="display"'>
        <Text variant="display">Sunset Condos</Text>
      </Row>
      <Row label='heading / lg'>
        <Text variant="heading" size="lg">
          Compliance overview
        </Text>
      </Row>
      <Row label="heading / md">
        <Text variant="heading" size="md">
          Board of Directors
        </Text>
      </Row>
      <Row label="heading / sm">
        <Text variant="heading" size="sm">
          Upcoming meetings
        </Text>
      </Row>
      <Row label='variant="body"'>
        <Text variant="body">
          Association records must be posted to the website within 30 days of
          creation under §718.111(12)(g).
        </Text>
      </Row>
      <Row label='"bodySmall"'>
        <Text variant="bodySmall" color="secondary">
          Applies to condominium associations operating 25 or more units.
        </Text>
      </Row>
      <Row label='"caption"'>
        <Text variant="caption" color="tertiary">
          Updated 14 March 2026 by Elena Ortiz
        </Text>
      </Row>
      <Row label='"mono"'>
        <Text variant="mono">RES-2026-0418 · unit 412-B</Text>
      </Row>
    </VStack>
  </Box>
);

export const ColorRoles = () => (
  <Box
    background="default"
    border
    radius="md"
    padding="lg"
    shadow="sm"
    maxWidth={780}
  >
    <VStack gap="md">
      <Text variant="heading" size="sm">
        Semantic colour keys
      </Text>
      <VStack gap="sm">
        <Row label="primary">
          <Text color="primary">Milestone inspection report — Building A</Text>
        </Row>
        <Row label="secondary">
          <Text color="secondary">Filed with the Division on 2 February 2026</Text>
        </Row>
        <Row label="tertiary">
          <Text color="tertiary">Retained for 7 years</Text>
        </Row>
        <Row label="disabled">
          <Text color="disabled">Archived — no longer editable</Text>
        </Row>
        <Row label="brand">
          <Text color="brand">Upgrade to Operations Plus</Text>
        </Row>
        <Row label="link">
          <Text color="link" decoration="underline">
            View the full statute
          </Text>
        </Row>
      </VStack>

      <Box borderTop paddingTop="md">
        <Text variant="caption" color="tertiary" transform="uppercase">
          Raw CSS colour — how a status tone gets in
        </Text>
      </Box>
      <VStack gap="sm">
        <Row label="--status-danger">
          <Text color="var(--status-danger)" weight="semibold">
            Reserve study 214 days overdue
          </Text>
        </Row>
        <Row label="--status-warning">
          <Text color="var(--status-warning)" weight="semibold">
            Board meeting notice posts in 3 days
          </Text>
        </Row>
        <Row label="--status-success">
          <Text color="var(--status-success)" weight="semibold">
            All 14 required documents posted
          </Text>
        </Row>
      </VStack>
    </VStack>
  </Box>
);

export const WeightsAndTransform = () => (
  <Box
    background="default"
    border
    radius="md"
    padding="lg"
    shadow="sm"
    maxWidth={780}
  >
    <VStack gap="md">
      <VStack gap="sm">
        <Text variant="caption" color="tertiary" transform="uppercase">
          Weight
        </Text>
        <Row label="normal">
          <Text weight="normal">Annual budget meeting — 12 April 2026</Text>
        </Row>
        <Row label="medium">
          <Text weight="medium">Annual budget meeting — 12 April 2026</Text>
        </Row>
        <Row label="semibold">
          <Text weight="semibold">Annual budget meeting — 12 April 2026</Text>
        </Row>
        <Row label="bold">
          <Text weight="bold">Annual budget meeting — 12 April 2026</Text>
        </Row>
      </VStack>

      <Box borderTop paddingTop="md">
        <VStack gap="sm">
          <Text variant="caption" color="tertiary" transform="uppercase">
            Transform &amp; decoration
          </Text>
          <Row label="uppercase">
            <Text variant="bodySmall" weight="semibold" transform="uppercase">
              Statutory record
            </Text>
          </Row>
          <Row label="capitalize">
            <Text variant="bodySmall" transform="capitalize">
              board president
            </Text>
          </Row>
          <Row label="line-through">
            <Text variant="bodySmall" color="tertiary" decoration="line-through">
              Hearing scheduled 08 March 2026
            </Text>
          </Row>
          <Row label="underline">
            <Text variant="bodySmall" color="link" decoration="underline">
              Reschedule hearing
            </Text>
          </Row>
        </VStack>
      </Box>
    </VStack>
  </Box>
);

export const TruncationAndClamp = () => (
  <HStack gap="lg" align="flex-start">
    <Box
      background="default"
      border
      radius="md"
      padding="md"
      shadow="sm"
      width={300}
    >
      <VStack gap="xs">
        <Text variant="caption" color="tertiary" transform="uppercase">
          truncate
        </Text>
        <Text weight="medium" truncate>
          Amended and Restated Declaration of Condominium — Sunset Condos, Miami
        </Text>
        <Text variant="bodySmall" color="tertiary" truncate>
          declaration-of-condominium-amended-2026-03-14-final.pdf
        </Text>
      </VStack>
    </Box>

    <Box
      background="default"
      border
      radius="md"
      padding="md"
      shadow="sm"
      width={300}
    >
      <VStack gap="xs">
        <Text variant="caption" color="tertiary" transform="uppercase">
          truncate + lines=&#123;2&#125;
        </Text>
        <Text variant="bodySmall" color="secondary" truncate lines={2}>
          Owner reports a persistent leak from the unit above affecting the
          primary bathroom ceiling. Water intrusion first noticed after the
          storm on 2 March; drywall is now discoloured across roughly one
          square metre.
        </Text>
      </VStack>
    </Box>

    <Box
      background="subtle"
      border
      radius="md"
      padding="md"
      width={220}
    >
      <VStack gap="xs">
        <Text variant="caption" color="tertiary" transform="uppercase">
          whiteSpace=&quot;pre&quot;
        </Text>
        <Text variant="mono" whiteSpace="pre">
          {'Notice   14 days\nBoard    48 hours\nDocs     30 days'}
        </Text>
      </VStack>
    </Box>
  </HStack>
);
