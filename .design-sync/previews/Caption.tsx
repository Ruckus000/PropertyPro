import { FileText, Paperclip } from 'lucide-react';
import {
  Box,
  Caption,
  Heading,
  HStack,
  Paragraph,
  Text,
  VStack,
} from '@propertypro/design-system';

/**
 * Caption is Text pinned to the caption ramp (11px, medium, wide tracking) and
 * defaults to `color="tertiary"`. It is metadata only — timestamps, counts,
 * provenance, eyebrows — never primary content.
 */

export const DocumentMetadata = () => (
  <Box background="default" border radius="md" shadow="sm" maxWidth={640}>
    <Box padding="md" borderBottom>
      <HStack justify="space-between" align="center">
        <Heading level={4}>Official records</Heading>
        <Caption transform="uppercase">14 of 14 posted</Caption>
      </HStack>
    </Box>

    <Box padding="md" borderBottom>
      <HStack gap="md" align="flex-start">
        <FileText size={20} color="var(--text-tertiary)" aria-hidden="true" />
        <VStack gap="xs" style={{ minWidth: 0 }}>
          <Text weight="medium">Declaration of Condominium</Text>
          <Caption>PDF · 2.4 MB · posted 14 Mar 2026 by Elena Ortiz</Caption>
        </VStack>
      </HStack>
    </Box>

    <Box padding="md">
      <HStack gap="md" align="flex-start">
        <Paperclip size={20} color="var(--text-tertiary)" aria-hidden="true" />
        <VStack gap="xs" style={{ minWidth: 0 }}>
          <Text weight="medium">Q1 2026 financial statement</Text>
          <Caption color="var(--status-warning)">
            Created 22 Feb 2026 · posting deadline in 3 days
          </Caption>
        </VStack>
      </HStack>
    </Box>
  </Box>
);

export const Tones = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={640}>
    <VStack gap="md">
      <VStack gap="sm">
        <Caption transform="uppercase">Default — tertiary</Caption>
        <Caption>Retained for seven years under the association records policy</Caption>
      </VStack>

      <Box borderTop paddingTop="md">
        <VStack gap="sm">
          <Caption transform="uppercase">Status tones</Caption>
          <Caption color="var(--status-success)">Posted within the 30-day window</Caption>
          <Caption color="var(--status-warning)">Deadline in 3 days</Caption>
          <Caption color="var(--status-danger)">214 days overdue</Caption>
        </VStack>
      </Box>

      <Box borderTop paddingTop="md">
        <VStack gap="sm">
          <Caption transform="uppercase">Weight &amp; colour overrides</Caption>
          <HStack gap="lg" wrap>
            <Caption color="secondary">color=&quot;secondary&quot;</Caption>
            <Caption weight="bold">weight=&quot;bold&quot;</Caption>
            <Caption color="brand" weight="semibold">
              color=&quot;brand&quot;
            </Caption>
            <Caption decoration="underline" color="link">
              decoration=&quot;underline&quot;
            </Caption>
          </HStack>
        </VStack>
      </Box>
    </VStack>
  </Box>
);

export const KpiLabels = () => (
  <HStack gap="lg" align="stretch">
    <Box
      background="default"
      border
      radius="md"
      padding="lg"
      shadow="sm"
      style={{ flex: 1 }}
    >
      <VStack gap="xs">
        <Caption transform="uppercase">Compliance score</Caption>
        <Text variant="display">94%</Text>
        <Caption color="var(--status-success)">Up 6 points this quarter</Caption>
      </VStack>
    </Box>
    <Box
      background="default"
      border
      radius="md"
      padding="lg"
      shadow="sm"
      style={{ flex: 1 }}
    >
      <VStack gap="xs">
        <Caption transform="uppercase">Open violations</Caption>
        <Text variant="display">3</Text>
        <Caption>2 awaiting a hearing date</Caption>
      </VStack>
    </Box>
    <Box
      background="default"
      border
      radius="md"
      padding="lg"
      shadow="sm"
      style={{ flex: 1 }}
    >
      <VStack gap="xs">
        <Caption transform="uppercase">Work orders</Caption>
        <Text variant="display">18</Text>
        <Paragraph color="secondary">Median close time 4.2 days</Paragraph>
        <Caption color="var(--status-danger)">1 breached its SLA</Caption>
      </VStack>
    </Box>
  </HStack>
);
