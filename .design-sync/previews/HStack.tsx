import { Filter, Search, Upload } from 'lucide-react';
import {
  Box,
  Button,
  Caption,
  Code,
  Heading,
  HStack,
  Paragraph,
  Text,
  VStack,
} from '@propertypro/design-system';

/**
 * HStack is Stack pinned to `direction="row"`. Everything else — gap, align,
 * justify, wrap, padding, flex — is the Stack API. Use it for toolbars, list
 * rows, badge clusters and anything else that reads left to right.
 */

const Chip = ({ children, tone }: { children: string; tone?: string }) => (
  <Box
    background={tone ?? 'subtle'}
    border
    radius="full"
    paddingX="sm"
    paddingY={2}
  >
    <Text variant="caption" weight="semibold" transform="uppercase">
      {children}
    </Text>
  </Box>
);

export const Toolbar = () => (
  <Box background="default" border radius="md" padding="md" shadow="sm" maxWidth={780}>
    <HStack justify="space-between" align="center" gap="md">
      <VStack gap="xs">
        <Heading level={4}>Official records</Heading>
        <Caption>14 documents · 2 posted this week</Caption>
      </VStack>
      <HStack gap="sm" align="center">
        <Button variant="ghost" size="sm">
          <Search size={16} aria-hidden="true" />
          Search
        </Button>
        <Button variant="outline" size="sm">
          <Filter size={16} aria-hidden="true" />
          Filter
        </Button>
        <Button size="sm">
          <Upload size={16} aria-hidden="true" />
          Upload Document
        </Button>
      </HStack>
    </HStack>
  </Box>
);

export const AlignmentAxis = () => (
  <VStack gap="sm" style={{ maxWidth: 820 }}>
    <Caption transform="uppercase">align — the cross axis</Caption>
    <HStack gap="md" align="stretch">
      {(['flex-start', 'center', 'baseline', 'stretch'] as const).map((align) => (
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
            <Box background="subtle" radius="sm" height={104} padding="xs">
              <HStack gap="xs" align={align} style={{ height: '100%' }}>
                <Box background="default" border radius="sm" paddingX="xs" paddingY="xs">
                  <Text variant="caption" whiteSpace="nowrap">
                    412-B
                  </Text>
                </Box>
                <Box background="default" border radius="sm" paddingX="xs" paddingY="md">
                  <Text variant="bodySmall" weight="medium" whiteSpace="nowrap">
                    Owner
                  </Text>
                </Box>
              </HStack>
            </Box>
          </VStack>
        </Box>
      ))}
    </HStack>
    <Paragraph color="secondary">
      Two children of deliberately different heights. `flex-start` pins them to the
      top, `center` splits the leftover space, only `baseline` lines up the text
      baselines, and only `stretch` fills the track. `flex-end` (not shown) is the
      mirror of `flex-start`.
    </Paragraph>
  </VStack>
);

export const ResidentRows = () => (
  <Box background="default" border radius="md" shadow="sm" overflow="hidden" maxWidth={720}>
    <Box padding="md" borderBottom background="subtle">
      <HStack justify="space-between" align="center">
        <Heading level={4}>Residents</Heading>
        <Caption transform="uppercase">Sunset Condos · 48 units</Caption>
      </HStack>
    </Box>

    {(
      [
        ['MD', 'Marisol Delgado', '412-B', ['owner', 'board president'], 'var(--status-owner-bg)'],
        ['JT', 'Jonah Tran', '208-A', ['tenant'], 'var(--surface-muted)'],
        ['PA', 'Priya Anand', '117-C', ['owner', 'delinquent'], 'var(--status-owner-bg)'],
      ] as const
    ).map(([initials, name, unit, tags, tone]) => (
      <Box key={unit} borderBottom padding="md">
        <HStack gap="md" align="center">
          <Box
            background={tone}
            border
            radius="full"
            width={40}
            height={40}
            display="flex"
            style={{ alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Text variant="bodySmall" weight="semibold">
              {initials}
            </Text>
          </Box>

          <VStack gap="xs" style={{ minWidth: 0, flex: 1 }}>
            <Text weight="medium">{name}</Text>
            <HStack gap="xs" align="center" wrap>
              <Code color="tertiary">unit {unit}</Code>
              {tags.map((tag) => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </HStack>
          </VStack>

          <Button variant="ghost" size="sm">
            View
          </Button>
        </HStack>
      </Box>
    ))}
  </Box>
);

export const WrapAndInline = () => (
  <VStack gap="lg" style={{ maxWidth: 560 }}>
    <Box background="default" border radius="md" padding="md" shadow="sm">
      <VStack gap="sm">
        <Code color="tertiary">wrap — filter chips overflow onto a second row</Code>
        <HStack gap="sm" wrap>
          {[
            'Declaration',
            'Bylaws',
            'Articles',
            'Rules & regulations',
            'Budget 2026',
            'Reserve study',
            'Insurance certificate',
            'Meeting minutes',
          ].map((label) => (
            <Chip key={label}>{label}</Chip>
          ))}
        </HStack>
      </VStack>
    </Box>

    <Box background="default" border radius="md" padding="md" shadow="sm">
      <VStack gap="sm">
        <Code color="tertiary">inline — sits in the run of text</Code>
        <Paragraph color="secondary">
          Posted by{' '}
          <HStack inline gap="xs" align="center" style={{ verticalAlign: 'middle' }}>
            <Box background="var(--interactive-subtle)" radius="full" paddingX="xs" paddingY={1}>
              <Text variant="caption" weight="semibold">
                EO
              </Text>
            </Box>
            <Text variant="bodySmall" weight="medium">
              Elena Ortiz
            </Text>
          </HStack>{' '}
          on 14 March 2026, three days inside the statutory window.
        </Paragraph>
      </VStack>
    </Box>
  </VStack>
);
