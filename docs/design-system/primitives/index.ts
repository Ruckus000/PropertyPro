/**
 * Primitives - Low-level building blocks
 *
 * These components are the foundation of the design system.
 * They provide token-based styling without imposing specific patterns.
 *
 * Usage:
 * - Use Box for general containers and layout
 * - Use Stack/HStack/VStack for flex-based layouts
 * - Use Text and variants for all typography
 *
 * @see https://atomicdesign.bradfrost.com/chapter-2/
 */

// Box - Foundational container
export { Box, default as BoxDefault } from "./Box";
export type { BoxProps } from "./Box";

// Stack - Flex layout
export {
  Stack,
  HStack,
  VStack,
  Center,
  Spacer,
  default as StackDefault,
} from "./Stack";
export type { StackProps } from "./Stack";

// Text - Typography
export {
  Text,
  Heading,
  Label,
  Caption,
  Code,
  Paragraph,
  default as TextDefault,
} from "./Text";
export type { TextProps } from "./Text";
