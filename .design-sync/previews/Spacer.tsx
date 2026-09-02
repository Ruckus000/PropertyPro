import { Bell, Download } from 'lucide-react';
import {
  Box,
  Button,
  Caption,
  Code,
  Heading,
  HStack,
  Paragraph,
  Spacer,
  Text,
  VStack,
} from '@propertypro/design-system';

/**
 * Spacer renders nothing — an aria-hidden div with `flex` and no other style.
 * It exists to eat the free space between two siblings in a Stack, which is why
 * every preview below shows it BETWEEN two visible elements: the gap it opens is
 * the whole subject. Reach for it when `justify="space-between"` cannot express
 * the split (three or more children, or an uneven weighting).
 */

export const PushesActionsRight = () => (
  <VStack gap="lg" style={{ maxWidth: 720 }}>
    <VStack gap="sm">
      <Caption transform="uppercase">Without a Spacer — everything bunches left</Caption>
      <Box background="default" border radius="md" padding="md" shadow="sm">
        <HStack gap="sm" align="center">
          <Heading level={4}>Official records</Heading>
          <Caption>14 documents</Caption>
          <Button variant="outline" size="sm">
            <Download size={16} aria-hidden="true" />
            Export
          </Button>
          <Button size="sm">Upload Document</Button>
        </HStack>
      </Box>
    </VStack>

    <VStack gap="sm">
      <Caption transform="uppercase">With a Spacer between the meta and the actions</Caption>
      <Box background="default" border radius="md" padding="md" shadow="sm">
        <HStack gap="sm" align="center">
          <Heading level={4}>Official records</Heading>
          <Caption>14 documents</Caption>
          <Spacer />
          <Button variant="outline" size="sm">
            <Download size={16} aria-hidden="true" />
            Export
          </Button>
          <Button size="sm">Upload Document</Button>
        </HStack>
      </Box>
      <Code color="tertiary">
        &lt;Caption/&gt; &lt;Spacer/&gt; &lt;Button/&gt; — the title group and the action
        group split, and the gap absorbs every pixel left over.
      </Code>
    </VStack>
  </VStack>
);

export const WeightedSplit = () => (
  <VStack gap="lg" style={{ maxWidth: 760 }}>
    <VStack gap="xs">
      <Heading level={4}>Weighted gaps</Heading>
      <Paragraph color="secondary">
        Two Spacers with different `flex` values divide the leftover width in
        that ratio — a split `justify` cannot express.
      </Paragraph>
    </VStack>

    <VStack gap="sm">
      <Code color="tertiary">flex=&#123;1&#125; then flex=&#123;1&#125; — even thirds</Code>
      <Box background="subtle" border radius="md" padding="sm">
        <HStack align="center">
          <Box background="default" border radius="sm" paddingX="sm" paddingY="xs">
            <Text variant="caption" weight="semibold">
              Notice sent
            </Text>
          </Box>
          <Spacer flex={1} />
          <Box background="default" border radius="sm" paddingX="sm" paddingY="xs">
            <Text variant="caption" weight="semibold">
              Hearing
            </Text>
          </Box>
          <Spacer flex={1} />
          <Box background="default" border radius="sm" paddingX="sm" paddingY="xs">
            <Text variant="caption" weight="semibold">
              Cured
            </Text>
          </Box>
        </HStack>
      </Box>
    </VStack>

    <VStack gap="sm">
      <Code color="tertiary">flex=&#123;1&#125; then flex=&#123;3&#125; — the second gap is three times wider</Code>
      <Box background="subtle" border radius="md" padding="sm">
        <HStack align="center">
          <Box background="default" border radius="sm" paddingX="sm" paddingY="xs">
            <Text variant="caption" weight="semibold">
              Notice sent
            </Text>
          </Box>
          <Spacer flex={1} />
          <Box background="default" border radius="sm" paddingX="sm" paddingY="xs">
            <Text variant="caption" weight="semibold">
              Hearing
            </Text>
          </Box>
          <Spacer flex={3} />
          <Box background="default" border radius="sm" paddingX="sm" paddingY="xs">
            <Text variant="caption" weight="semibold">
              Cured
            </Text>
          </Box>
        </HStack>
      </Box>
      <Caption>
        14-day notice, then the hearing, then the cure window — the gaps carry the
        elapsed time.
      </Caption>
    </VStack>
  </VStack>
);

export const PushesFooterDown = () => (
  <HStack gap="lg" align="flex-start">
    <Box
      background="default"
      border
      radius="md"
      shadow="sm"
      width={300}
      height={300}
      padding="lg"
    >
      <VStack gap="sm" style={{ height: '100%' }}>
        <Caption transform="uppercase">Without a Spacer</Caption>
        <Heading level={4}>Delinquency</Heading>
        <Paragraph color="secondary">
          Six units are behind on the Q1 assessment.
        </Paragraph>
        <HStack gap="sm" align="center">
          <Bell size={16} color="var(--text-tertiary)" aria-hidden="true" />
          <Caption>Reminders sent 12 March</Caption>
        </HStack>
      </VStack>
    </Box>

    <Box
      background="default"
      border
      radius="md"
      shadow="sm"
      width={300}
      height={300}
      padding="lg"
    >
      <VStack gap="sm" style={{ height: '100%' }}>
        <Caption transform="uppercase">With a Spacer</Caption>
        <Heading level={4}>Delinquency</Heading>
        <Paragraph color="secondary">
          Six units are behind on the Q1 assessment.
        </Paragraph>
        <Spacer />
        <HStack gap="sm" align="center">
          <Bell size={16} color="var(--text-tertiary)" aria-hidden="true" />
          <Caption>Reminders sent 12 March</Caption>
        </HStack>
      </VStack>
    </Box>
  </HStack>
);
