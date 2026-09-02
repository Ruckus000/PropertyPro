import {
  Box,
  Caption,
  Code,
  Heading,
  HStack,
  Paragraph,
  VStack,
} from '@propertypro/design-system';

/**
 * Heading is the Text primitive pinned to a heading element. `level` drives BOTH
 * the tag and the type ramp: 1 → <h1> display, 2 → <h2> heading/lg,
 * 3 → <h3> heading/md, 4 → <h4> heading/sm. Reach for `level`, not `size`.
 */

export const Levels = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={720}>
    <VStack gap="lg">
      <VStack gap="xs">
        <Heading level={1}>Sunset Condos</Heading>
        <Code color="tertiary">level=1 → &lt;h1&gt; · display</Code>
      </VStack>
      <VStack gap="xs">
        <Heading level={2}>Statutory compliance</Heading>
        <Code color="tertiary">level=2 → &lt;h2&gt; · heading/lg</Code>
      </VStack>
      <VStack gap="xs">
        <Heading level={3}>Document posting</Heading>
        <Code color="tertiary">level=3 → &lt;h3&gt; · heading/md</Code>
      </VStack>
      <VStack gap="xs">
        <Heading level={4}>Declaration &amp; bylaws</Heading>
        <Code color="tertiary">level=4 → &lt;h4&gt; · heading/sm</Code>
      </VStack>
    </VStack>
  </Box>
);

export const PageTitleBlock = () => (
  <Box background="page" padding="xl" radius="md" border maxWidth={780}>
    <VStack gap="md">
      <VStack gap="xs">
        <Caption transform="uppercase">Governance</Caption>
        <Heading level={1}>Board of Directors</Heading>
        <Paragraph color="secondary">
          Five seats, elected annually. Board designations are read only by
          statutory features — they do not grant general permissions.
        </Paragraph>
      </VStack>

      <Box borderTop paddingTop="md">
        <VStack gap="sm">
          <Heading level={3}>Next election</Heading>
          <Paragraph color="secondary">
            First notice must be mailed at least 60 days before the annual
            meeting; the second notice follows no later than 14 days before.
          </Paragraph>
          <HStack gap="lg">
            <VStack gap="xs">
              <Caption transform="uppercase">Annual meeting</Caption>
              <Heading level={4}>12 April 2026</Heading>
            </VStack>
            <VStack gap="xs">
              <Caption transform="uppercase">First notice due</Caption>
              <Heading level={4}>11 February 2026</Heading>
            </VStack>
            <VStack gap="xs">
              <Caption transform="uppercase">Candidates</Caption>
              <Heading level={4}>7</Heading>
            </VStack>
          </HStack>
        </VStack>
      </Box>
    </VStack>
  </Box>
);

export const AlignColourAndTruncation = () => (
  <VStack gap="lg" style={{ maxWidth: 780 }}>
    <Box background="default" border radius="md" padding="lg" shadow="sm">
      <VStack gap="sm">
        <Heading level={3} align="center">
          No violations open
        </Heading>
        <Paragraph color="secondary" align="center">
          Every reported violation at Sunset Condos has been cured or closed.
        </Paragraph>
      </VStack>
    </Box>

    <HStack gap="lg" align="stretch">
      <Box
        background="default"
        border="error"
        radius="md"
        padding="md"
        style={{ flex: 1, minWidth: 0 }}
      >
        <VStack gap="xs">
          <Caption transform="uppercase" color="var(--status-danger)">
            Overdue
          </Caption>
          <Heading level={4} color="var(--status-danger)">
            Structural Integrity Reserve Study
          </Heading>
          <Paragraph color="secondary">Due 31 December 2024 · 214 days late</Paragraph>
        </VStack>
      </Box>

      <Box background="default" border radius="md" padding="md" width={300}>
        <VStack gap="xs">
          <Caption transform="uppercase">truncate</Caption>
          <Heading level={4} truncate>
            Amended and Restated Declaration of Condominium
          </Heading>
          <Paragraph color="tertiary" truncate lines={2}>
            Recorded in the Public Records of Miami-Dade County on 14 March 2026
            at Book 33412, Page 1187.
          </Paragraph>
        </VStack>
      </Box>
    </HStack>
  </VStack>
);
