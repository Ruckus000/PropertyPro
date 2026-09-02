import { CalendarDays, MapPin, Users } from 'lucide-react';
import {
  Box,
  Button,
  Caption,
  Code,
  Heading,
  HStack,
  Paragraph,
  Text,
  UiLabel,
  VStack,
} from '@propertypro/design-system';

/**
 * VStack is Stack pinned to `direction="column"`. It is the workhorse for
 * vertical rhythm: section stacks, field columns, list-row detail. Gaps come
 * from semanticSpacing.stack, so `gap="lg"` is the 24px section rhythm the
 * dashboard uses.
 */

export const GapScale = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={720}>
    <VStack gap="lg">
      <VStack gap="xs">
        <Heading level={4}>Vertical rhythm</Heading>
        <Paragraph color="secondary">
          The same two rows at each step of the stack scale.
        </Paragraph>
      </VStack>
      <HStack gap="lg" align="flex-start">
        {(
          [
            ['xs', '8px'],
            ['sm', '12px'],
            ['md', '16px'],
            ['lg', '24px'],
            ['xl', '32px'],
          ] as const
        ).map(([gap, px]) => (
          <VStack key={gap} gap="xs" style={{ flex: 1 }}>
            <Code color="tertiary">
              {gap} · {px}
            </Code>
            <Box background="subtle" border radius="sm" padding="xs">
              <VStack gap={gap}>
                <Box background="default" border radius="sm" paddingX="xs" paddingY="xs">
                  <Text variant="caption">Notice</Text>
                </Box>
                <Box background="default" border radius="sm" paddingX="xs" paddingY="xs">
                  <Text variant="caption">Agenda</Text>
                </Box>
              </VStack>
            </Box>
          </VStack>
        ))}
      </HStack>
    </VStack>
  </Box>
);

export const AlignAxis = () => (
  <VStack gap="sm" style={{ maxWidth: 820 }}>
    <Caption transform="uppercase">align — the cross axis of a column</Caption>
    <HStack gap="md" align="stretch">
      {(['stretch', 'flex-start', 'center', 'flex-end'] as const).map((align) => (
        <Box
          key={align}
          background="default"
          border
          radius="md"
          padding="sm"
          style={{ flex: 1, minWidth: 0 }}
        >
          <VStack gap="xs">
            <Code color="tertiary">{align}</Code>
            <Box background="subtle" radius="sm" padding="xs">
              <VStack gap="xs" align={align}>
                <Box background="default" border radius="sm" paddingX="sm" paddingY="xs">
                  <Text variant="caption">Cured</Text>
                </Box>
                <Box background="default" border radius="sm" paddingX="sm" paddingY="xs">
                  <Text variant="caption">Hearing scheduled</Text>
                </Box>
              </VStack>
            </Box>
          </VStack>
        </Box>
      ))}
    </HStack>
    <Paragraph color="secondary">
      `stretch` is the default — the two pills only take their natural width once
      the cross axis stops stretching them.
    </Paragraph>
  </VStack>
);

export const MeetingDetailColumn = () => (
  <Box background="default" border radius="md" shadow="sm" maxWidth={520}>
    <Box padding="lg">
      <VStack gap="lg">
        <VStack gap="xs">
          <Caption transform="uppercase">Board meeting</Caption>
          <Heading level={3}>Q2 budget workshop</Heading>
          <Paragraph color="secondary">
            Notice was posted 48 hours ahead, as required for a board meeting.
          </Paragraph>
        </VStack>

        <VStack gap="md">
          <HStack gap="sm" align="center">
            <CalendarDays size={18} color="var(--text-tertiary)" aria-hidden="true" />
            <VStack gap="xs">
              <UiLabel color="tertiary">When</UiLabel>
              <Text>Tuesday 12 April 2026, 7:00 PM</Text>
            </VStack>
          </HStack>
          <HStack gap="sm" align="center">
            <MapPin size={18} color="var(--text-tertiary)" aria-hidden="true" />
            <VStack gap="xs">
              <UiLabel color="tertiary">Where</UiLabel>
              <Text>Clubhouse, 1420 Ocean Drive, Miami</Text>
            </VStack>
          </HStack>
          <HStack gap="sm" align="center">
            <Users size={18} color="var(--text-tertiary)" aria-hidden="true" />
            <VStack gap="xs">
              <UiLabel color="tertiary">Quorum</UiLabel>
              <Text>3 of 5 directors confirmed</Text>
            </VStack>
          </HStack>
        </VStack>
      </VStack>
    </Box>

    <Box padding="md" borderTop background="subtle">
      <HStack gap="sm" justify="flex-end">
        <Button variant="outline" size="sm">
          Download agenda
        </Button>
        <Button size="sm">Post minutes</Button>
      </HStack>
    </Box>
  </Box>
);

export const PaddedPanel = () => (
  <HStack gap="lg" align="flex-start">
    <VStack
      gap="md"
      padding="lg"
      style={{
        width: 300,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
      }}
    >
      <Code color="tertiary">padding=&quot;lg&quot; gap=&quot;md&quot;</Code>
      <VStack gap="xs">
        <UiLabel color="tertiary">Reserve balance</UiLabel>
        <Text variant="heading" size="lg">
          $412,880
        </Text>
        <Caption color="var(--status-success)">Fully funded through 2029</Caption>
      </VStack>
      <Box borderTop paddingTop="md">
        <VStack gap="xs">
          <UiLabel color="tertiary">Next study due</UiLabel>
          <Text>31 December 2026</Text>
        </VStack>
      </Box>
    </VStack>

    <VStack
      gap="xs"
      padding="sm"
      style={{
        width: 300,
        background: 'var(--surface-subtle)',
        border: '1px solid var(--border-default)',
        borderRadius: 10,
      }}
    >
      <Code color="tertiary">padding=&quot;sm&quot; gap=&quot;xs&quot;</Code>
      <Text variant="bodySmall" weight="medium">
        Delinquency ageing
      </Text>
      <Caption>0–30 days · 4 units</Caption>
      <Caption>31–60 days · 1 unit</Caption>
      <Caption color="var(--status-danger)">90+ days · 1 unit, lien filed</Caption>
    </VStack>
  </HStack>
);
