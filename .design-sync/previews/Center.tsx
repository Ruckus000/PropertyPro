import { FolderOpen, Loader2, ShieldCheck } from 'lucide-react';
import {
  Box,
  Button,
  Caption,
  Center,
  Code,
  Heading,
  HStack,
  Paragraph,
  Text,
  VStack,
} from '@propertypro/design-system';

/**
 * Center is Stack with `align="center"` and `justify="center"` pinned. It still
 * takes `direction`, so it centres a column (empty states, stat tiles) or a row
 * (inline loading, a centred footer note). Give the parent a height — the
 * primitive centres inside whatever box it is handed.
 */

export const EmptyState = () => (
  <Box
    background="default"
    border
    radius="md"
    shadow="sm"
    height={340}
    maxWidth={620}
    padding="xl"
  >
    <Center gap="md" style={{ height: '100%' }}>
      <Box background="var(--interactive-subtle)" radius="full" padding="md">
        <FolderOpen size={28} color="var(--interactive-primary)" aria-hidden="true" />
      </Box>
      <VStack gap="xs" align="center">
        <Heading level={3} align="center">
          Let&apos;s get your records posted
        </Heading>
        <Paragraph color="secondary" align="center">
          Nothing has been uploaded for Sunset Condos yet. Post the declaration
          and bylaws first — the §718.111(12)(g) clock starts the day a record is
          created, not the day you find it.
        </Paragraph>
      </VStack>
      <HStack gap="sm">
        <Button>Upload Document</Button>
        <Button variant="outline">Import from a folder</Button>
      </HStack>
    </Center>
  </Box>
);

export const StatTiles = () => (
  <HStack gap="lg" align="stretch">
    {(
      [
        ['94%', 'Compliance score', 'var(--status-success)', 'Up 6 this quarter'],
        ['3', 'Open violations', 'var(--status-warning)', '2 awaiting a hearing'],
        ['214', 'Days overdue', 'var(--status-danger)', 'Reserve study'],
      ] as const
    ).map(([value, label, tone, meta]) => (
      <Box
        key={label}
        background="default"
        border
        radius="md"
        shadow="sm"
        height={168}
        width={220}
        padding="lg"
      >
        <Center gap="xs" style={{ height: '100%' }}>
          <Text variant="display" color={tone}>
            {value}
          </Text>
          <Text variant="bodySmall" weight="medium" align="center">
            {label}
          </Text>
          <Caption align="center">{meta}</Caption>
        </Center>
      </Box>
    ))}
  </HStack>
);

export const RowCentring = () => (
  <VStack gap="lg" style={{ maxWidth: 620 }}>
    <Box background="default" border radius="md" shadow="sm" height={120} padding="md">
      <Center direction="row" gap="sm" style={{ height: '100%' }}>
        <Loader2 size={18} color="var(--text-tertiary)" aria-hidden="true" />
        <Text color="secondary">Rebuilding the compliance score…</Text>
      </Center>
    </Box>

    <Box background="subtle" border radius="md" height={120} padding="md">
      <Center direction="row" gap="sm" style={{ height: '100%' }}>
        <ShieldCheck size={18} color="var(--status-success)" aria-hidden="true" />
        <Text variant="bodySmall" weight="medium" color="var(--status-success)">
          All 14 required documents are posted and current
        </Text>
      </Center>
    </Box>

    <Box background="default" border radius="md" padding="md">
      <Center gap="xs">
        <Code color="tertiary">direction=&quot;row&quot; · gap=&quot;sm&quot;</Code>
        <Caption>Showing 1–25 of 48 residents</Caption>
      </Center>
    </Box>
  </VStack>
);
