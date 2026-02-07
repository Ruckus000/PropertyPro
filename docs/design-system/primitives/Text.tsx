/**
 * Text - Typography primitive
 *
 * A polymorphic text component that maps to typography tokens.
 * Provides consistent text styling across the design system.
 *
 * @example
 * <Text variant="heading" size="md" color="primary">Hello World</Text>
 * <Text variant="caption" color="tertiary" as="span">Subtitle</Text>
 *
 * @see https://medium.com/eightshapes-llc/typography-in-design-systems-6ed771432f1e
 */

import React, { forwardRef, ElementType, ComponentPropsWithoutRef } from "react";
import {
  semanticTypography,
  semanticColors,
  primitiveFonts,
  TypographyVariant,
} from "../tokens";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

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
  /**
   * Typography variant from the token system
   * @default "body"
   */
  variant?: TextVariant;

  /**
   * Size preset for heading variant (maps to old heading3/heading2/heading1)
   * @default "md"
   */
  size?: HeadingSize;

  /**
   * Text color (maps to semantic text colors)
   * Can also accept a raw CSS color value
   * @default "primary"
   */
  color?: TextColor | string;

  /**
   * Body weight (body/bodySmall) or override for other variants
   */
  weight?: keyof typeof primitiveFonts.weight;

  /**
   * Text alignment
   */
  align?: "left" | "center" | "right" | "justify";

  /**
   * Text transformation
   */
  transform?: "none" | "uppercase" | "lowercase" | "capitalize";

  /**
   * Text decoration
   */
  decoration?: "none" | "underline" | "line-through";

  /**
   * Truncate text with ellipsis
   */
  truncate?: boolean;

  /**
   * Limit text to N lines with ellipsis (requires truncate)
   */
  lines?: number;

  /**
   * White space handling
   */
  whiteSpace?: "normal" | "nowrap" | "pre" | "pre-wrap" | "pre-line";

  /**
   * Word break behavior
   */
  wordBreak?: "normal" | "break-all" | "break-word" | "keep-all";

  /**
   * Custom style override
   */
  style?: React.CSSProperties;
}

export type TextProps<C extends ElementType = "span"> = PolymorphicComponentProp<C, TextOwnProps>;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

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

  // Use provided element or infer from variant
  const Component =
    as ||
    legacyDefaultElements[variant as LegacyTypographyVariant] ||
    getDefaultElement(resolvedVariant, resolvedSize);

  // Get typography tokens
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

  // Build truncation styles
  const truncateStyles: React.CSSProperties = truncate
    ? lines && lines > 1
      ? {
          // Multi-line truncation
          display: "-webkit-box",
          WebkitLineClamp: lines,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }
      : {
          // Single line truncation
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }
    : {};

  const computedStyle: React.CSSProperties = {
    // Typography tokens
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSize,
    fontWeight: weight ? primitiveFonts.weight[weight] : typography.fontWeight,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
    // Color
    color: resolveColor(color),
    // Optional styles
    ...(align && { textAlign: align }),
    ...(transform && { textTransform: transform }),
    ...(decoration && { textDecoration: decoration }),
    ...(whiteSpace && !truncate && { whiteSpace }),
    ...(wordBreak && { wordBreak }),
    // Truncation
    ...truncateStyles,
    // Reset margin for text elements
    margin: 0,
    // Custom overrides
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

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE VARIANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Heading - Semantic heading component with automatic level mapping
 */
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

/**
 * Label - For form labels and small titles
 */
export const Label = forwardRef<HTMLLabelElement, Omit<TextProps<"label">, "as" | "variant">>(
  (props, ref) => (
    <Text ref={ref} as="label" variant="bodySmall" weight="medium" {...props} />
  )
);
Label.displayName = "Label";

/**
 * Caption - For metadata and small descriptions
 */
export const Caption = forwardRef<HTMLSpanElement, Omit<TextProps<"span">, "as" | "variant">>(
  ({ color = "tertiary", ...props }, ref) => (
    <Text ref={ref} as="span" variant="caption" color={color} {...props} />
  )
);
Caption.displayName = "Caption";

/**
 * Code - For inline code and monospace text
 */
export const Code = forwardRef<HTMLElement, Omit<TextProps<"code">, "as" | "variant">>(
  (props, ref) => (
    <Text ref={ref} as="code" variant="mono" {...props} />
  )
);
Code.displayName = "Code";

/**
 * Paragraph - For body paragraphs
 */
export const Paragraph = forwardRef<HTMLParagraphElement, Omit<TextProps<"p">, "as" | "variant">>(
  (props, ref) => (
    <Text ref={ref} as="p" variant="body" {...props} />
  )
);
Paragraph.displayName = "Paragraph";

export default Text;
