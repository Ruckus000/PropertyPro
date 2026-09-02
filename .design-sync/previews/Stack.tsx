import {
  Box,
  Caption,
  Code,
  Heading,
  HStack,
  Paragraph,
  Stack,
  Text,
  VStack,
} from '@propertypro/design-system';

/**
 * Stack is the flexbox primitive. `direction` is the axis HStack / VStack /
 * Center pin for you; everything else (gap, align, justify, wrap, padding,
 * inline, as) is shared. Gaps resolve through semanticSpacing.stack —
 * xs 8, sm 12, md 16, lg 24, xl 32 — so never hand-roll a pixel gap.
 */

const Tile = ({ children }: { children: string }) => (
  <Box background="subtle" border radius="sm" paddingX="sm" paddingY="xs">
    <Text variant="bodySmall" weight="medium">
      {children}
    </Text>
  </Box>
);

export const Direction = () => (
  <VStack gap="md" style={{ maxWidth: 820 }}>
    {(
      [
        [
          ['column', 'A records checklist reads top to bottom.'],
          ['row', 'A filter bar reads left to right.'],
        ],
        [
          ['column-reverse', 'Newest-first feeds that append at the bottom.'],
          ['row-reverse', 'Right-anchored action groups in a dialog footer.'],
        ],
      ] as const
    ).map((pair, rowIndex) => (
      <HStack key={rowIndex} gap="md" align="stretch">
        {pair.map(([direction, why]) => (
          <Box
            key={direction}
            background="default"
            border
            radius="md"
            padding="md"
            style={{ flex: 1, minWidth: 0 }}
          >
            <VStack gap="sm">
              <VStack gap="xs">
                <Code color="tertiary">direction=&quot;{direction}&quot;</Code>
                <Caption>{why}</Caption>
              </VStack>
              <Stack direction={direction} gap="sm" align="flex-start">
                <Tile>Declaration</Tile>
                <Tile>Bylaws</Tile>
                <Tile>Budget 2026</Tile>
              </Stack>
            </VStack>
          </Box>
        ))}
      </HStack>
    ))}
  </VStack>
);

export const GapScale = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={720}>
    <VStack gap="md">
      <VStack gap="xs">
        <Heading level={4}>gap — semanticSpacing.stack</Heading>
        <Paragraph color="secondary">
          The same three chips at each step of the scale.
        </Paragraph>
      </VStack>
      {(
        [
          ['xs', '8px'],
          ['sm', '12px'],
          ['md', '16px'],
          ['lg', '24px'],
          ['xl', '32px'],
        ] as const
      ).map(([gap, px]) => (
        <HStack key={gap} gap="md" align="center">
          <Box width={92} style={{ flexShrink: 0 }}>
            <Code color="tertiary">
              {gap} · {px}
            </Code>
          </Box>
          <Stack direction="row" gap={gap}>
            <Tile>Open</Tile>
            <Tile>In review</Tile>
            <Tile>Cured</Tile>
          </Stack>
        </HStack>
      ))}
    </VStack>
  </Box>
);

export const JustifyAxis = () => (
  <VStack gap="md" style={{ maxWidth: 800 }}>
    <VStack gap="xs">
      <Heading level={4}>justify — distribution along the main axis</Heading>
      <Paragraph color="secondary">
        The same three nav chips in a fixed-width track. `align` is covered on
        HStack and VStack; this is the other half of the pair.
      </Paragraph>
    </VStack>
    {(
      [
        'flex-start',
        'center',
        'flex-end',
        'space-between',
        'space-around',
        'space-evenly',
      ] as const
    ).map((justify) => (
      <HStack key={justify} gap="md" align="center">
        <Box width={132} style={{ flexShrink: 0 }}>
          <Code color="tertiary">{justify}</Code>
        </Box>
        <Box background="subtle" border radius="md" padding="sm" style={{ flex: 1 }}>
          <Stack direction="row" justify={justify} gap="sm">
            <Tile>Documents</Tile>
            <Tile>Meetings</Tile>
            <Tile>Violations</Tile>
          </Stack>
        </Box>
      </HStack>
    ))}
  </VStack>
);

export const ComposedRecordList = () => (
  <Box background="default" border radius="md" shadow="sm" overflow="hidden" maxWidth={680}>
    <Stack direction="row" justify="space-between" align="center" padding="md">
      <Heading level={4}>Open work orders</Heading>
      <Caption transform="uppercase">3 unassigned</Caption>
    </Stack>

    {(
      [
        ['WO-2026-0311', 'Pool pump replacement', 'Aqua Systems LLC', 'Due in 2 days'],
        ['WO-2026-0308', 'Lobby glass door closer', 'Unassigned', 'Due today'],
        ['WO-2026-0297', 'Garage lighting survey', 'Bright Coast Electric', 'Due in 9 days'],
      ] as const
    ).map(([id, title, vendor, due]) => (
      <Box key={id} borderTop>
        <Stack direction="row" justify="space-between" align="center" gap="md" padding="md">
          <Stack direction="column" gap="xs" style={{ minWidth: 0 }}>
            <Text weight="medium">{title}</Text>
            <Stack direction="row" gap="sm" align="center">
              <Code color="tertiary">{id}</Code>
              <Caption>{vendor}</Caption>
            </Stack>
          </Stack>
          <Caption color={due === 'Due today' ? 'var(--status-warning)' : undefined}>
            {due}
          </Caption>
        </Stack>
      </Box>
    ))}
  </Box>
);
