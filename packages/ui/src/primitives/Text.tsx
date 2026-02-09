/**
 * Text — Typography primitive with polymorphic rendering
 */

import React, { forwardRef, type ElementType, type ComponentPropsWithoutRef } from "react";
import {
  semanticTypography,
  semanticColors,
  primitiveFonts,
} from "../tokens";
import type { TypographyVariant } from "../tokens";

type TextColor = keyof typeof semanticColors.text;
type HeadingSize = "sm" | "md" | "lg";
type BodyWeight = "normal" | "medium";

type LegacyTypographyVariant =
  | "heading1"
  | "heading2"
  | "heading3"
  | "bodyMedium"
  | "bodySm"
  | "bodySmMedium"
  | "captionBold"
  | "monoMedium";

type TextVariant = TypographyVariant | LegacyTypographyVariant;

type AsProp<C extends ElementType> = { as?: C };
type PropsToOmit<C extends ElementType, P> = keyof (AsProp<C> & P);
type PolymorphicComponentProp<
  C extends ElementType,
  Props = object
> = React.PropsWithChildren<Props & AsProp<C>> &
  Omit<ComponentPropsWithoutRef<C>, PropsToOmit<C, Props>>;

interface TextOwnProps {
  variant?: TextVariant;
  size?: HeadingSize;
  color?: TextColor | string;
  weight?: keyof typeof primitiveFonts.weight;
  align?: "left" | "center" | "right" | "justify";
  transform?: "none" | "uppercase" | "lowercase" | "capitalize";
  decoration?: "none" | "underline" | "line-through";
  truncate?: boolean;
  lines?: number;
  whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";
  wordBreak?: "normal" | "break-all" | "break-word" | "keep-all";
  style?: React.CSSProperties;
}

export type TextProps<C extends ElementType = "span"> = PolymorphicComponentProp<C, TextOwnProps>;

function resolveColor(color: TextColor | string | undefined): string {
  if (color === undefined) return semanticColors.text.primary;
  if (color in semanticColors.text) {
    return semanticColors.text[color as TextColor];
  }
  return color;
}

function getDefaultElement(variant: TypographyVariant, size: HeadingSize): ElementType {
  if (variant === "display") return "h1";
  if (variant === "heading") {
    return size === "lg" ? "h2" : size === "sm" ? "h4" : "h3";
  }
  if (variant === "body" || variant === "bodySmall") return "p";
  if (variant === "caption") return "span";
  if (variant === "mono") return "code";
  return "span";
}

function TextInner<C extends ElementType = "span">(
  {
    as,
    children,
    variant = "body",
    size,
    color = "primary",
    weight,
    align,
    transform,
    decoration,
    truncate = false,
    lines,
    whiteSpace,
    wordBreak,
    style,
    ...restProps
  }: TextProps<C>,
  ref: React.Ref<Element>
) {
  const legacyVariantMap: Partial<
    Record<
      LegacyTypographyVariant,
      { variant: TypographyVariant; size?: HeadingSize; weight?: BodyWeight }
    >
  > = {
    heading1: { variant: "heading", size: "lg" },
    heading2: { variant: "heading", size: "md" },
    heading3: { variant: "heading", size: "sm" },
    bodyMedium: { variant: "body", weight: "medium" },
    bodySm: { variant: "bodySmall", weight: "normal" },
    bodySmMedium: { variant: "bodySmall", weight: "medium" },
  };

  const legacy = legacyVariantMap[variant as LegacyTypographyVariant];
  const resolvedVariant = (legacy?.variant ?? variant) as TypographyVariant;
  const resolvedSize: HeadingSize = legacy?.size ?? size ?? "md";
  const resolvedBodyWeight: BodyWeight =
    legacy?.weight ?? (weight === "medium" ? "medium" : "normal");

  const legacyDefaultElements: Partial<Record<LegacyTypographyVariant, ElementType>> = {
    heading1: "h2",
    heading2: "h3",
    heading3: "h4",
    bodyMedium: "span",
    bodySm: "p",
    bodySmMedium: "span",
    captionBold: "span",
    monoMedium: "code",
  };

  const Component =
    as ||
    legacyDefaultElements[variant as LegacyTypographyVariant] ||
    getDefaultElement(resolvedVariant, resolvedSize);

  const typography = (() => {
    switch (resolvedVariant) {
      case "display":
        return semanticTypography.display;
      case "heading":
        return semanticTypography.heading[resolvedSize];
      case "body":
        return semanticTypography.body[resolvedBodyWeight];
      case "bodySmall":
        return semanticTypography.bodySmall[resolvedBodyWeight];
      case "caption":
        return semanticTypography.caption;
      case "mono":
        return semanticTypography.mono;
      default:
        return semanticTypography.body.normal;
    }
  })();

  const truncateStyles: React.CSSProperties = truncate
    ? lines && lines > 1
      ? {
          display: "-webkit-box",
          WebkitLineClamp: lines,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }
      : {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }
    : {};

  const computedStyle: React.CSSProperties = {
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    fontWeight: weight ? primitiveFonts.weight[weight] : typography.fontWeight,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    color: resolveColor(color),
    ...(align && { textAlign: align }),
    ...(transform && { textTransform: transform }),
    ...(decoration && { textDecoration: decoration }),
    ...(whiteSpace && !truncate && { whiteSpace }),
    ...(wordBreak && { wordBreak }),
    ...truncateStyles,
    margin: 0,
    ...style,
  };

  return (
    <Component ref={ref} style={computedStyle} {...restProps}>
      {children}
    </Component>
  );
}

export const Text = forwardRef(TextInner) as <C extends ElementType = "span">(
  props: TextProps<C> & { ref?: React.Ref<Element> }
) => React.ReactElement | null;

(Text as React.FC).displayName = "Text";

interface HeadingProps extends Omit<TextProps<"h1" | "h2" | "h3" | "h4" | "h5" | "h6">, "variant" | "as"> {
  level?: 1 | 2 | 3 | 4;
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ level = 1, ...props }, ref) => {
    const elementMap: Record<number, "h1" | "h2" | "h3" | "h4"> = {
      1: "h1",
      2: "h2",
      3: "h3",
      4: "h4",
    };
    const textProps: Pick<TextOwnProps, "variant" | "size"> =
      level === 1
        ? { variant: "display" }
        : {
            variant: "heading",
            size: level === 2 ? "lg" : level === 3 ? "md" : "sm",
          };
    return (
      <Text
        ref={ref}
        as={elementMap[level]}
        {...textProps}
        {...props}
      />
    );
  }
);
Heading.displayName = "Heading";

export const Label = forwardRef<HTMLLabelElement, Omit<TextProps<"label">, "as" | "variant">>(
  (props, ref) => (
    <Text ref={ref} as="label" variant="bodySmall" weight="medium" {...props} />
  )
);
Label.displayName = "Label";

export const Caption = forwardRef<HTMLSpanElement, Omit<TextProps<"span">, "as" | "variant">>(
  ({ color = "tertiary", ...props }, ref) => (
    <Text ref={ref} as="span" variant="caption" color={color} {...props} />
  )
);
Caption.displayName = "Caption";

export const Code = forwardRef<HTMLElement, Omit<TextProps<"code">, "as" | "variant">>(
  (props, ref) => (
    <Text ref={ref} as="code" variant="mono" {...props} />
  )
);
Code.displayName = "Code";

export const Paragraph = forwardRef<HTMLParagraphElement, Omit<TextProps<"p">, "as" | "variant">>(
  (props, ref) => (
    <Text ref={ref} as="p" variant="body" {...props} />
  )
);
Paragraph.displayName = "Paragraph";

export default Text;
