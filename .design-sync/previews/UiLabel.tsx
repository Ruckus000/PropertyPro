import {
  Box,
  Caption,
  Heading,
  HStack,
  Input,
  Label,
  Paragraph,
  Text,
  UiLabel,
  VStack,
} from '@propertypro/design-system';

/**
 * UiLabel is a TYPOGRAPHY primitive from the Text family: a <label> element on
 * the bodySmall/medium ramp, styled by token objects rather than Tailwind.
 *
 * It is NOT the shadcn form label. That one is exported as `Label` and carries
 * the form-control behaviour (peer-disabled styling, htmlFor pairing with an
 * Input). Reach for `UiLabel` when you want a small label-shaped piece of type;
 * reach for `Label` whenever there is a real control to label.
 */

export const DetailPanelLabels = () => (
  <Box background="default" border radius="md" shadow="sm" maxWidth={640}>
    <Box padding="md" borderBottom>
      <Heading level={4}>Unit 412-B</Heading>
    </Box>
    <Box padding="lg">
      <VStack gap="md">
        <HStack gap="xl" align="flex-start">
          <VStack gap="xs" style={{ flex: 1 }}>
            <UiLabel color="tertiary">Owner of record</UiLabel>
            <Text>Marisol Delgado</Text>
          </VStack>
          <VStack gap="xs" style={{ flex: 1 }}>
            <UiLabel color="tertiary">Role</UiLabel>
            <Text>Resident · unit owner</Text>
          </VStack>
        </HStack>

        <HStack gap="xl" align="flex-start">
          <VStack gap="xs" style={{ flex: 1 }}>
            <UiLabel color="tertiary">Board designation</UiLabel>
            <Text>Board president</Text>
          </VStack>
          <VStack gap="xs" style={{ flex: 1 }}>
            <UiLabel color="tertiary">Ownership since</UiLabel>
            <Text>08 August 2019</Text>
          </VStack>
        </HStack>

        <Box borderTop paddingTop="md">
          <VStack gap="xs">
            <UiLabel color="tertiary">Estoppel status</UiLabel>
            <Text color="var(--status-success)" weight="medium">
              No outstanding assessments
            </Text>
            <Caption>Last reconciled 14 March 2026</Caption>
          </VStack>
        </Box>
      </VStack>
    </Box>
  </Box>
);

export const TypographyNotFormLabel = () => (
  <HStack gap="lg" align="stretch">
    <Box
      background="default"
      border
      radius="md"
      padding="lg"
      shadow="sm"
      style={{ flex: 1, minWidth: 0 }}
    >
      <VStack gap="sm">
        <Caption transform="uppercase">UiLabel — typography primitive</Caption>
        <Paragraph color="secondary">
          A styled &lt;label&gt; from the Text family. No control, no htmlFor —
          it labels a value you are only displaying.
        </Paragraph>
        <Box borderTop paddingTop="sm">
          <VStack gap="xs">
            <UiLabel color="tertiary">Annual assessment</UiLabel>
            <Text variant="heading" size="md">
              $4,860.00
            </Text>
            <UiLabel color="tertiary">Billed</UiLabel>
            <Text>Quarterly, due the 1st</Text>
          </VStack>
        </Box>
      </VStack>
    </Box>

    <Box
      background="default"
      border
      radius="md"
      padding="lg"
      shadow="sm"
      style={{ flex: 1, minWidth: 0 }}
    >
      <VStack gap="sm">
        <Caption transform="uppercase">Label — the form label</Caption>
        <Paragraph color="secondary">
          The shadcn control label. Pair it with an Input via htmlFor; it also
          dims with a disabled peer.
        </Paragraph>
        <Box borderTop paddingTop="sm">
          <VStack gap="sm">
            <VStack gap="xs">
              <Label htmlFor="assessment-amount">Assessment amount</Label>
              <Input id="assessment-amount" defaultValue="4860.00" />
            </VStack>
            <VStack gap="xs">
              <Label htmlFor="assessment-cadence">Billing cadence</Label>
              <Input id="assessment-cadence" defaultValue="Quarterly" />
            </VStack>
          </VStack>
        </Box>
      </VStack>
    </Box>
  </HStack>
);

export const EmphasisAxes = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={640}>
    <VStack gap="md">
      <VStack gap="sm">
        <Caption transform="uppercase">Colour</Caption>
        <UiLabel>Default — primary</UiLabel>
        <UiLabel color="secondary">Secondary</UiLabel>
        <UiLabel color="tertiary">Tertiary — the detail-panel default</UiLabel>
        <UiLabel color="var(--status-danger)">Required · missing</UiLabel>
      </VStack>

      <Box borderTop paddingTop="md">
        <VStack gap="sm">
          <Caption transform="uppercase">Weight &amp; transform</Caption>
          <UiLabel weight="normal">weight=&quot;normal&quot;</UiLabel>
          <UiLabel weight="semibold">weight=&quot;semibold&quot;</UiLabel>
          <UiLabel transform="uppercase" color="tertiary">
            Section label
          </UiLabel>
          <UiLabel truncate>
            Truncates at the container edge — Structural Integrity Reserve Study
            supporting schedule
          </UiLabel>
        </VStack>
      </Box>
    </VStack>
  </Box>
);
