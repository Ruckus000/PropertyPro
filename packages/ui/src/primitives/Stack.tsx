/**
 * Stack — Flexbox layout primitive
 */

import React, { forwardRef, type ElementType, type ComponentPropsWithoutRef } from "react";
import { semanticSpacing } from "../tokens";

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
  direction?: "row" | "column" | "row-reverse" | "column-reverse";
  gap?: SpaceValue;
  gapX?: SpaceValue;
  gapY?: SpaceValue;
  align?: "flex-start" | "flex-end" | "center" | "stretch" | "baseline";
  justify?: "flex-start" | "flex-end" | "center" | "space-between" | "space-around" | "space-evenly";
  wrap?: boolean | "wrap" | "nowrap" | "wrap-reverse";
  flex?: number | string;
  inline?: boolean;
  padding?: SpaceValue;
  paddingX?: SpaceValue;
  paddingY?: SpaceValue;
  style?: React.CSSProperties;
}

export type StackProps<C extends ElementType = "div"> = PolymorphicComponentProp<C, StackOwnProps>;

function resolveSpace(value: SpaceValue | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return value;
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

function StackInner<C extends ElementType = "div">(
  {
    as,
    children,
    direction = "column",
    gap, gapX, gapY,
    align = "stretch",
    justify = "flex-start",
    wrap = false,
    flex,
    inline = false,
    padding, paddingX, paddingY,
    style,
    ...restProps
  }: StackProps<C>,
  ref: React.Ref<HTMLElement>
) {
  const Component = as || "div";

  const computedGap = resolveSpace(gap);
  const computedGapX = gapX !== undefined ? resolveSpace(gapX) : computedGap;
  const computedGapY = gapY !== undefined ? resolveSpace(gapY) : computedGap;

  const paddingVertical = resolveInset(paddingY ?? padding);
  const paddingHorizontal = resolveInset(paddingX ?? padding);

  const flexWrap = wrap === true ? "wrap" as const : wrap === false ? "nowrap" as const : wrap;

  const computedStyle: React.CSSProperties = {
    boxSizing: "border-box",
    display: inline ? "inline-flex" : "flex",
    flexDirection: direction,
    alignItems: align,
    justifyContent: justify,
    flexWrap,
    ...(flex !== undefined && { flex }),
    ...(computedGapX !== undefined && { columnGap: computedGapX }),
    ...(computedGapY !== undefined && { rowGap: computedGapY }),
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

  return React.createElement(Component, { ref, style: computedStyle, ...restProps }, children);
}

export const Stack = forwardRef(StackInner) as <C extends ElementType = "div">(
  props: StackProps<C> & { ref?: React.Ref<HTMLElement> }
) => React.ReactElement | null;

(Stack as React.FC).displayName = "Stack";

export const HStack = forwardRef<HTMLElement, Omit<StackProps<"div">, "direction">>(
  (props, ref) => <Stack ref={ref} direction="row" {...props} />
);
(HStack as React.FC).displayName = "HStack";

export const VStack = forwardRef<HTMLElement, Omit<StackProps<"div">, "direction">>(
  (props, ref) => <Stack ref={ref} direction="column" {...props} />
);
(VStack as React.FC).displayName = "VStack";

export const Center = forwardRef<HTMLElement, Omit<StackProps<"div">, "align" | "justify">>(
  (props, ref) => <Stack ref={ref} align="center" justify="center" {...props} />
);
(Center as React.FC).displayName = "Center";

export const Spacer: React.FC<{ flex?: number | string }> = ({ flex = 1 }) => (
  <div style={{ flex }} aria-hidden="true" />
);
Spacer.displayName = "Spacer";

export default Stack;
