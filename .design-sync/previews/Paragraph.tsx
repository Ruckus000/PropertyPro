import {
  Box,
  Caption,
  Heading,
  HStack,
  Paragraph,
  VStack,
} from '@propertypro/design-system';

/**
 * Paragraph is Text pinned to <p> with the body ramp. Its live axes are
 * `weight`, `color`, `align`, `transform`, `decoration`, `truncate`/`lines` and
 * `whiteSpace`. `size` is inert here — the body ramp has one size — so sweeping
 * it would look like a broken control.
 */

export const StatutoryNotice = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={720}>
    <VStack gap="sm">
      <Heading level={3}>Official records posting</Heading>
      <Paragraph color="secondary">
        A condominium association operating 25 or more units must maintain a
        website and post its official records there. Under §718.111(12)(g), a
        record must appear within 30 days of the date it is created or received.
      </Paragraph>
      <Paragraph color="secondary">
        PropertyPro tracks the posting clock per document and raises the item to
        the compliance dashboard once fewer than seven days remain. It does not
        provide legal advice — confirm every deadline with association counsel.
      </Paragraph>
      <Caption>Last reviewed 14 March 2026 · Sunset Condos, Miami</Caption>
    </VStack>
  </Box>
);

export const WeightAndColour = () => (
  <Box background="default" border radius="md" padding="lg" shadow="sm" maxWidth={720}>
    <VStack gap="md">
      <VStack gap="xs">
        <Caption transform="uppercase">Weight</Caption>
        <Paragraph weight="normal">
          Normal — the default body copy weight for record descriptions.
        </Paragraph>
        <Paragraph weight="medium">
          Medium — used when a paragraph carries a lead-in for a list.
        </Paragraph>
        <Paragraph weight="semibold">
          Semibold — a callout line inside an otherwise plain block.
        </Paragraph>
        <Paragraph weight="bold">
          Bold — reserved for a single statutory deadline in a notice.
        </Paragraph>
      </VStack>

      <Box borderTop paddingTop="md">
        <VStack gap="xs">
          <Caption transform="uppercase">Colour</Caption>
          <Paragraph color="primary">
            Primary — the hearing is scheduled for 08 March 2026 at 7:00 PM.
          </Paragraph>
          <Paragraph color="secondary">
            Secondary — supporting detail such as the meeting location and the
            agenda packet link.
          </Paragraph>
          <Paragraph color="tertiary">
            Tertiary — provenance and retention notes that sit below the fold.
          </Paragraph>
          <Paragraph color="var(--status-danger)">
            Danger — the 14-day owner notice was not mailed in time.
          </Paragraph>
        </VStack>
      </Box>
    </VStack>
  </Box>
);

export const AlignAndClamp = () => (
  <VStack gap="lg" style={{ maxWidth: 800 }}>
    <HStack gap="lg" align="stretch">
      <Box background="default" border radius="md" padding="md" style={{ flex: 1, minWidth: 0 }}>
        <VStack gap="xs">
          <Caption transform="uppercase">align=&quot;left&quot;</Caption>
          <Paragraph color="secondary">
            Reserve funding is voted on annually by the membership.
          </Paragraph>
        </VStack>
      </Box>
      <Box background="default" border radius="md" padding="md" style={{ flex: 1, minWidth: 0 }}>
        <VStack gap="xs">
          <Caption transform="uppercase" align="center">
            align=&quot;center&quot;
          </Caption>
          <Paragraph color="secondary" align="center">
            Reserve funding is voted on annually by the membership.
          </Paragraph>
        </VStack>
      </Box>
      <Box background="default" border radius="md" padding="md" style={{ flex: 1, minWidth: 0 }}>
        <VStack gap="xs">
          <Caption transform="uppercase" align="right">
            align=&quot;right&quot;
          </Caption>
          <Paragraph color="secondary" align="right">
            Reserve funding is voted on annually by the membership.
          </Paragraph>
        </VStack>
      </Box>
    </HStack>

    <Box background="default" border radius="md" padding="md">
      <VStack gap="xs">
        <Caption transform="uppercase">align=&quot;justify&quot;</Caption>
        <Paragraph color="secondary" align="justify">
          The association shall maintain adequate insurance covering all common
          elements, association property, and the units as originally installed,
          based on the replacement cost of the property as determined by an
          independent appraisal obtained at least every 36 months.
        </Paragraph>
      </VStack>
    </Box>

    <Box background="subtle" border radius="md" padding="md" width={420}>
      <VStack gap="xs">
        <Caption transform="uppercase">truncate + lines=&#123;3&#125;</Caption>
        <Paragraph color="secondary" truncate lines={3}>
          Owner reports a persistent leak from the unit above affecting the
          primary bathroom ceiling. Water intrusion was first noticed after the
          storm on 2 March; drywall is now discoloured across roughly one square
          metre and the extractor fan has stopped drawing. Requesting a plumbing
          inspection before the ceiling is patched.
        </Paragraph>
      </VStack>
    </Box>
  </VStack>
);
