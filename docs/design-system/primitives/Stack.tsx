/**
 * Stack - Flexbox layout primitive
 *
 * A composable layout component for managing flex containers.
 * Implements the "Stack" pattern common in design systems.
 *
 * @example
 * <Stack direction="row" gap="md" align="center">
 *   <Button>One</Button>
 *   <Button>Two</Button>
 * </Stack>
 *
 * @see https://every-layout.dev/layouts/stack/
 * @see https://chakra-ui.com/docs/components/stack
 */

import React, { forwardRef, ElementType, ComponentPropsWithoutRef } from "react";
import { semanticSpacing, primitiveSpace, createTransition } from "../tokens";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type SpaceSize = "xs" | "sm" | "md" | "lg" | "xl";
type SpaceValue = SpaceSize | number;

type AsProp<C extends ElementType> = { as?: C };

type PropsToOmit<C extends ElementType, P> = keyof (AsProp<C> & P);

type PolymorphicComponentProp<
  C extends ElementType,
  Props = object
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

interface StackOwnProps {
  /**
   * The flex direction
   * @default "column"
   */
  direction?: "row" | "column" | "row-reverse" | "column-reverse";

  /**
   * The gap between children (maps to semantic spacing tokens)
   */
  gap?: SpaceValue;

  /**
   * Horizontal gap (overrides gap for x-axis)
   */
  gapX?: SpaceValue;

  /**
   * Vertical gap (overrides gap for y-axis)
   */
  gapY?: SpaceValue;

  /**
   * Align items on the cross axis
   */
  align?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";

  /**
   * Justify content on the main axis
   */
  justify?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly";

  /**
   * Whether to wrap children
   */
  wrap?: boolean | "wrap" | "nowrap" | "wrap-reverse";

  /**
   * Flex grow/shrink behavior
   */
  flex?: number | string;

  /**
   * Display as inline-flex instead of flex
   */
  inline?: boolean;

  /**
   * Padding values (uses inset spacing scale)
   */
  padding?: SpaceValue;
  paddingX?: SpaceValue;
  paddingY?: SpaceValue;

  /**
   * Custom style override
   */
  style?: React.CSSProperties;
}

export type StackProps<C extends ElementType = "div"> = PolymorphicComponentProp<C, StackOwnProps>;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function resolveSpace(value: SpaceValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;

  // Map size names to stack spacing values
  const stackSpacing: Record<SpaceSize, number> = {
    xs: semanticSpacing.stack.xs,
    sm: semanticSpacing.stack.sm,
    md: semanticSpacing.stack.md,
    lg: semanticSpacing.stack.lg,
    xl: semanticSpacing.stack.xl,
  };

  return stackSpacing[value];
}

function resolveInset(value: SpaceValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  return semanticSpacing.inset[value];
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function StackInner<C extends ElementType = "div">(
  {
    as,
    children,
    direction = "column",
    gap,
    gapX,
    gapY,
    align = "stretch",
    justify = "flex-start",
    wrap = false,
    flex,
    inline = false,
    padding,
    paddingX,
    paddingY,
    style,
    ...restProps
  }: StackProps<C>,
  ref: React.Ref<Element>
) {
  const Component = as || "div";

  // Resolve gaps
  const computedGap = resolveSpace(gap);
  const computedGapX = gapX !== undefined ? resolveSpace(gapX) : computedGap;
  const computedGapY = gapY !== undefined ? resolveSpace(gapY) : computedGap;

  // Resolve padding
  const paddingVertical = resolveInset(paddingY ?? padding);
  const paddingHorizontal = resolveInset(paddingX ?? padding);

  // Resolve wrap
  const flexWrap = wrap === true ? "wrap" : wrap === false ? "nowrap" : wrap;

  const computedStyle: React.CSSProperties = {
    boxSizing: "border-box",
    display: inline ? "inline-flex" : "flex",
    flexDirection: direction,
    alignItems: align,
    justifyContent: justify,
    flexWrap,
    ...(flex !== undefined && { flex }),
    // Use column-gap and row-gap for better support
    ...(computedGapX !== undefined && { columnGap: computedGapX }),
    ...(computedGapY !== undefined && { rowGap: computedGapY }),
    // Padding
    ...(paddingVertical !== undefined && {
      paddingTop: paddingVertical,
      paddingBottom: paddingVertical,
    }),
    ...(paddingHorizontal !== undefined && {
      paddingLeft: paddingHorizontal,
      paddingRight: paddingHorizontal,
    }),
    ...style,
  };

  return (
    <Component ref={ref} style={computedStyle} {...restProps}>
      {children}
    </Component>
  );
}

export const Stack = forwardRef(StackInner) as <C extends ElementType = "div">(
  props: StackProps<C> & { ref?: React.Ref<Element> }
) => React.ReactElement | null;

(Stack as React.FC).displayName = "Stack";

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HStack - Horizontal Stack (row direction)
 */
export const HStack = forwardRef<Element, Omit<StackProps<"div">, "direction">>(
  (props, ref) => <Stack ref={ref} direction="row" {...props} />
);
(HStack as React.FC).displayName = "HStack";

/**
 * VStack - Vertical Stack (column direction)
 */
export const VStack = forwardRef<Element, Omit<StackProps<"div">, "direction">>(
  (props, ref) => <Stack ref={ref} direction="column" {...props} />
);
(VStack as React.FC).displayName = "VStack";

/**
 * Center - Centered flex container
 */
export const Center = forwardRef<Element, Omit<StackProps<"div">, "align" | "justify">>(
  (props, ref) => <Stack ref={ref} align="center" justify="center" {...props} />
);
(Center as React.FC).displayName = "Center";

/**
 * Spacer - Flexible spacer for pushing elements apart
 */
export const Spacer: React.FC<{ flex?: number | string }> = ({ flex = 1 }) => (
  <div style={{ flex }} aria-hidden="true" />
);
Spacer.displayName = "Spacer";

export default Stack;
