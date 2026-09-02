import type { ReactNode } from 'react';
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
 * Code is Text pinned to <code> with the mono ramp. It ships no chrome of its
 * own — wrap it in a Box when you want a chip. Used across PropertyPro for
 * statute citations, record identifiers, migration names and audit payloads.
 */

const Chip = ({ children }: { children: ReactNode }) => (
  <Box
    background="subtle"
    border
    radius="sm"
    paddingX="xs"
    paddingY={2}
    display="inline-block"
  >
    <Code>{children}</Code>
  </Box>
);

export const InlineReferences = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={720}>
    <VStack gap="sm">
      <Heading level={3}>Why this document is tracked</Heading>
      <Paragraph color="secondary">
        The posting clock is driven by <Code>§718.111(12)(g)</Code>, evaluated in{' '}
        <Code>packages/shared/src/compliance/posting-deadline.ts</Code> so every
        surface reads the same elapsed-milliseconds window.
      </Paragraph>
      <Paragraph color="secondary">
        Each transition writes a row to <Code>compliance_audit_log</Code> with
        the action <Code>document.posted</Code>. That table is append-only, so a
        correction is a new row, never an edit.
      </Paragraph>
      <Caption>Resource: documents · community 1 · Sunset Condos</Caption>
    </VStack>
  </Box>
);

export const IdentifierChips = () => (
  <Box background="default" border radius="md" shadow="sm" maxWidth={720}>
    <Box padding="md" borderBottom>
      <Heading level={4}>Audit trail</Heading>
    </Box>

    <Box padding="md" borderBottom>
      <HStack justify="space-between" align="center" gap="md">
        <VStack gap="xs" style={{ minWidth: 0 }}>
          <Text weight="medium">Violation notice issued</Text>
          <HStack gap="xs" align="center" wrap>
            <Chip>violations</Chip>
            <Chip>VIO-2026-0117</Chip>
            <Chip>unit 412-B</Chip>
          </HStack>
        </VStack>
        <Caption>14 Mar 2026, 09:41</Caption>
      </HStack>
    </Box>

    <Box padding="md" borderBottom>
      <HStack justify="space-between" align="center" gap="md">
        <VStack gap="xs" style={{ minWidth: 0 }}>
          <Text weight="medium">ARC request approved</Text>
          <HStack gap="xs" align="center" wrap>
            <Chip>arc_requests</Chip>
            <Chip>ARC-2026-0042</Chip>
            <Chip>hurricane shutters</Chip>
          </HStack>
        </VStack>
        <Caption>13 Mar 2026, 16:02</Caption>
      </HStack>
    </Box>

    <Box padding="md">
      <HStack gap="lg" wrap align="center">
        <Code color="tertiary">GET /api/v1/documents</Code>
        <Code color="var(--status-success)">200 OK</Code>
        <Code color="var(--status-danger)">42501 permission denied</Code>
      </HStack>
    </Box>
  </Box>
);

export const PayloadBlock = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={720}>
    <VStack gap="sm">
      <Heading level={4}>Recorded change</Heading>
      <Caption transform="uppercase">newValues</Caption>
      <Box background="sunken" border="subtle" radius="sm" padding="md" overflow="auto">
        <Code whiteSpace="pre">
          {`{
  "status": "posted",
  "postedAt": "2026-03-14T14:41:07.318Z",
  "deadlineAt": "2026-04-13T14:41:07.318Z",
  "daysRemaining": 30,
  "postedBy": "elena.ortiz@sunset.local"
}`}
        </Code>
      </Box>
      <Paragraph color="tertiary">
        Never write a secret into this payload — the log is board-readable and
        append-only, so a leaked value cannot be removed.
      </Paragraph>
    </VStack>
  </Box>
);
