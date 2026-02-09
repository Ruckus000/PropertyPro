/**
 * Box — Foundational layout primitive
 *
 * Polymorphic container with token-based spacing, colors, and layout properties.
 */

import React, { forwardRef, type ElementType, type ComponentPropsWithoutRef } from "react";
import {
  semanticColors,
  semanticSpacing,
  primitiveRadius,
  primitiveShadow,
  createTransition,
} from "../tokens";

type SpaceSize = "xs" | "sm" | "md" | "lg" | "xl";
type SpaceValue = SpaceSize | number;
type SurfaceColor = keyof typeof semanticColors.surface;
type BorderColor = keyof typeof semanticColors.border;
type RadiusSize = keyof typeof primitiveRadius;
type ShadowSize = keyof typeof primitiveShadow;

type AsProp<C extends ElementType> = { as?: C };
type PropsToOmit<C extends ElementType, P> = keyof (AsProp<C> & P);
type PolymorphicComponentProp<
  C extends ElementType,
  Props = object
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

interface BoxOwnProps {
  padding?: SpaceValue;
  paddingX?: SpaceValue;
  paddingY?: SpaceValue;
  paddingTop?: SpaceValue;
  paddingRight?: SpaceValue;
  paddingBottom?: SpaceValue;
  paddingLeft?: SpaceValue;
  margin?: SpaceValue;
  marginX?: SpaceValue;
  marginY?: SpaceValue;
  marginTop?: SpaceValue;
  marginRight?: SpaceValue;
  marginBottom?: SpaceValue;
  marginLeft?: SpaceValue;
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
  display?: "block" | "inline" | "inline-block" | "flex" | "inline-flex" | "grid" | "none";
  position?: "static" | "relative" | "absolute" | "fixed" | "sticky";
  overflow?: "visible" | "hidden" | "scroll" | "auto";
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  minHeight?: string | number;
  maxWidth?: string | number;
  maxHeight?: string | number;
  cursor?: "pointer" | "default" | "not-allowed" | "grab" | "grabbing";
  transition?: boolean | string;
  style?: React.CSSProperties;
}

export type BoxProps<C extends ElementType = "div"> = PolymorphicComponentProp<C, BoxOwnProps>;

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

function BoxInner<C extends ElementType = "div">(
  {
    as,
    children,
    padding, paddingX, paddingY, paddingTop, paddingRight, paddingBottom, paddingLeft,
    margin, marginX, marginY, marginTop, marginRight, marginBottom, marginLeft,
    background, border, borderTop, borderRight, borderBottom, borderLeft,
    borderWidth = 1, borderColor, radius, shadow,
    display, position, overflow, width, height, minWidth, minHeight, maxWidth, maxHeight,
    cursor, transition, style,
    ...restProps
  }: BoxProps<C>,
  ref: React.Ref<Element>
) {
  const Component = as || "div";

  const pTop = resolveSpacing(paddingTop ?? paddingY ?? padding);
  const pRight = resolveSpacing(paddingRight ?? paddingX ?? padding);
  const pBottom = resolveSpacing(paddingBottom ?? paddingY ?? padding);
  const pLeft = resolveSpacing(paddingLeft ?? paddingX ?? padding);

  const mTop = resolveSpacing(marginTop ?? marginY ?? margin);
  const mRight = resolveSpacing(marginRight ?? marginX ?? margin);
  const mBottom = resolveSpacing(marginBottom ?? marginY ?? margin);
  const mLeft = resolveSpacing(marginLeft ?? marginX ?? margin);

  const borderStyle = (value: boolean | BorderColor | undefined) => {
    if (value === undefined || value === false) return undefined;
    const color = typeof value === "string" ? resolveBorderColor(value) : resolveBorderColor(borderColor);
    return `${borderWidth}px solid ${color}`;
  };

  const transitionValue =
    transition === true
      ? createTransition()
      : typeof transition === "string"
      ? transition
      : undefined;

  const computedStyle: React.CSSProperties = {
    boxSizing: "border-box",
    ...(pTop !== undefined && { paddingTop: pTop }),
    ...(pRight !== undefined && { paddingRight: pRight }),
    ...(pBottom !== undefined && { paddingBottom: pBottom }),
    ...(pLeft !== undefined && { paddingLeft: pLeft }),
    ...(mTop !== undefined && { marginTop: mTop }),
    ...(mRight !== undefined && { marginRight: mRight }),
    ...(mBottom !== undefined && { marginBottom: mBottom }),
    ...(mLeft !== undefined && { marginLeft: mLeft }),
    ...(background && { background: resolveBackground(background) }),
    ...(border && { border: borderStyle(border) }),
    ...(borderTop && { borderTop: borderStyle(borderTop) }),
    ...(borderRight && { borderRight: borderStyle(borderRight) }),
    ...(borderBottom && { borderBottom: borderStyle(borderBottom) }),
    ...(borderLeft && { borderLeft: borderStyle(borderLeft) }),
    ...(radius !== undefined && { borderRadius: resolveRadius(radius) }),
    ...(shadow && { boxShadow: resolveShadow(shadow) }),
    ...(display && { display }),
    ...(position && { position }),
    ...(overflow && { overflow }),
    ...(width !== undefined && { width }),
    ...(height !== undefined && { height }),
    ...(minWidth !== undefined && { minWidth }),
    ...(minHeight !== undefined && { minHeight }),
    ...(maxWidth !== undefined && { maxWidth }),
    ...(maxHeight !== undefined && { maxHeight }),
    ...(cursor && { cursor }),
    ...(transitionValue && { transition: transitionValue }),
    ...style,
  };

  const componentProps = { ref, style: computedStyle, ...restProps };

  return React.createElement(Component, componentProps, children);
}

export const Box = forwardRef(BoxInner) as <C extends ElementType = "div">(
  props: BoxProps<C> & { ref?: React.Ref<HTMLElement> }
) => React.ReactElement | null;

(Box as React.FC).displayName = "Box";

export default Box;
