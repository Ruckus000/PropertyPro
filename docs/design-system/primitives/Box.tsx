/**
 * Box - The foundational layout primitive
 *
 * A polymorphic container component that provides:
 * - Consistent box-sizing
 * - Spacing props mapped to design tokens
 * - Style composition without CSS-in-JS overhead
 *
 * @example
 * <Box padding="md" background="surface">
 *   Content here
 * </Box>
 *
 * @see https://www.joshwcomeau.com/react/file-structure/
 * @see https://stitches.dev/docs/api#polymorphic-component
 */

import React, { forwardRef, ElementType, ComponentPropsWithoutRef } from "react";
import {
  semanticColors,
  semanticSpacing,
  primitiveRadius,
  primitiveShadow,
  createTransition,
} from "../tokens";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type SpaceSize = "xs" | "sm" | "md" | "lg" | "xl";
type SpaceValue = SpaceSize | number;

type SurfaceColor = keyof typeof semanticColors.surface;
type BorderColor = keyof typeof semanticColors.border;
type RadiusSize = keyof typeof primitiveRadius;
type ShadowSize = keyof typeof primitiveShadow;

// Polymorphic component types
type AsProp<C extends ElementType> = { as?: C };

type PropsToOmit<C extends ElementType, P> = keyof (AsProp<C> & P);

type PolymorphicComponentProp<
  C extends ElementType,
  Props = object
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

// Box-specific props
interface BoxOwnProps {
  // Padding
  padding?: SpaceValue;
  paddingX?: SpaceValue;
  paddingY?: SpaceValue;
  paddingTop?: SpaceValue;
  paddingRight?: SpaceValue;
  paddingBottom?: SpaceValue;
  paddingLeft?: SpaceValue;

  // Margin
  margin?: SpaceValue;
  marginX?: SpaceValue;
  marginY?: SpaceValue;
  marginTop?: SpaceValue;
  marginRight?: SpaceValue;
  marginBottom?: SpaceValue;
  marginLeft?: SpaceValue;

  // Appearance
  background?: SurfaceColor | string;
  border?: boolean | BorderColor;
  borderTop?: boolean | BorderColor;
  borderRight?: boolean | BorderColor;
  borderBottom?: boolean | BorderColor;
  borderLeft?: boolean | BorderColor;
  borderWidth?: number;
  borderColor?: BorderColor;
  radius?: RadiusSize | number;
  shadow?: ShadowSize;

  // Layout
  display?: "block" | "inline" | "inline-block" | "flex" | "inline-flex" | "grid" | "none";
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  minHeight?: string | number;
  maxWidth?: string | number;
  maxHeight?: string | number;

  // Interaction
  cursor?: "pointer" | "default" | "not-allowed" | "grab" | "grabbing";
  transition?: boolean | string;

  // Custom style override
  style?: React.CSSProperties;
}

export type BoxProps<C extends ElementType = "div"> = PolymorphicComponentProp<C, BoxOwnProps>;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function resolveSpacing(value: SpaceValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  return semanticSpacing.inset[value];
}

function resolveBackground(value: SurfaceColor | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value in semanticColors.surface) {
    return semanticColors.surface[value as SurfaceColor];
  }
  return value;
}

function resolveBorderColor(value: BorderColor | undefined): string {
  if (value === undefined) return semanticColors.border.default;
  return semanticColors.border[value];
}

function resolveRadius(value: RadiusSize | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
  return primitiveRadius[value];
}

function resolveShadow(value: ShadowSize | undefined): string | undefined {
  if (value === undefined) return undefined;
  return primitiveShadow[value];
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Box component - Foundational layout primitive
 *
 * Provides a polymorphic container with token-based spacing,
 * colors, and layout properties.
 */
function BoxInner<C extends ElementType = "div">(
  {
    as,
    children,
    // Padding
    padding,
    paddingX,
    paddingY,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    // Margin
    margin,
    marginX,
    marginY,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    // Appearance
    background,
    border,
    borderTop,
    borderRight,
    borderBottom,
    borderLeft,
    borderWidth = 1,
    borderColor,
    radius,
    shadow,
    // Layout
    display,
    position,
    overflow,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    // Interaction
    cursor,
    transition,
    // Style override
    style,
    ...restProps
  }: BoxProps<C>,
  ref: React.Ref<Element>
) {
  const Component = as || "div";

  // Build padding
  const pTop = resolveSpacing(paddingTop ?? paddingY ?? padding);
  const pRight = resolveSpacing(paddingRight ?? paddingX ?? padding);
  const pBottom = resolveSpacing(paddingBottom ?? paddingY ?? padding);
  const pLeft = resolveSpacing(paddingLeft ?? paddingX ?? padding);

  // Build margin
  const mTop = resolveSpacing(marginTop ?? marginY ?? margin);
  const mRight = resolveSpacing(marginRight ?? marginX ?? margin);
  const mBottom = resolveSpacing(marginBottom ?? marginY ?? margin);
  const mLeft = resolveSpacing(marginLeft ?? marginX ?? margin);

  // Build border
  const borderStyle = (value: boolean | BorderColor | undefined, side?: string) => {
    if (value === undefined || value === false) return undefined;
    const color = typeof value === "string" ? resolveBorderColor(value) : resolveBorderColor(borderColor);
    return `${borderWidth}px solid ${color}`;
  };

  // Build transition
  const transitionValue =
    transition === true
      ? createTransition()
      : typeof transition === "string"
      ? transition
      : undefined;

  const computedStyle: React.CSSProperties = {
    boxSizing: "border-box",
    // Padding
    ...(pTop !== undefined && { paddingTop: pTop }),
    ...(pRight !== undefined && { paddingRight: pRight }),
    ...(pBottom !== undefined && { paddingBottom: pBottom }),
    ...(pLeft !== undefined && { paddingLeft: pLeft }),
    // Margin
    ...(mTop !== undefined && { marginTop: mTop }),
    ...(mRight !== undefined && { marginRight: mRight }),
    ...(mBottom !== undefined && { marginBottom: mBottom }),
    ...(mLeft !== undefined && { marginLeft: mLeft }),
    // Appearance
    ...(background && { background: resolveBackground(background) }),
    ...(border && { border: borderStyle(border) }),
    ...(borderTop && { borderTop: borderStyle(borderTop) }),
    ...(borderRight && { borderRight: borderStyle(borderRight) }),
    ...(borderBottom && { borderBottom: borderStyle(borderBottom) }),
    ...(borderLeft && { borderLeft: borderStyle(borderLeft) }),
    ...(radius !== undefined && { borderRadius: resolveRadius(radius) }),
    ...(shadow && { boxShadow: resolveShadow(shadow) }),
    // Layout
    ...(display && { display }),
    ...(position && { position }),
    ...(overflow && { overflow }),
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
    ...(minWidth !== undefined && { minWidth }),
    ...(minHeight !== undefined && { minHeight }),
    ...(maxWidth !== undefined && { maxWidth }),
    ...(maxHeight !== undefined && { maxHeight }),
    // Interaction
    ...(cursor && { cursor }),
    ...(transitionValue && { transition: transitionValue }),
    // Merge with custom style
    ...style,
  };

  return (
    <Component ref={ref} style={computedStyle} {...restProps}>
      {children}
    </Component>
  );
}

// Forward ref with proper typing
export const Box = forwardRef(BoxInner) as <C extends ElementType = "div">(
  props: BoxProps<C> & { ref?: React.Ref<Element> }
) => React.ReactElement | null;

// Display name for debugging
(Box as React.FC).displayName = "Box";

export default Box;
