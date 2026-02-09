/**
 * Card - Container for grouped content
 *
 * Implements compound component pattern with slots for:
 * - Header (with title, subtitle, actions)
 * - Body (main content)
 * - Footer (actions, metadata)
 *
 * @example
 * // Simple card
 * <Card>Content here</Card>
 *
 * // Structured card
 * <Card>
 *   <Card.Header>
 *     <Card.Title>Title</Card.Title>
 *     <Card.Actions><Button /></Card.Actions>
 *   </Card.Header>
 *   <Card.Body>
 *     Main content
 *   </Card.Body>
 *   <Card.Footer>
 *     Footer content
 *   </Card.Footer>
 * </Card>
 *
 * @see https://www.radix-ui.com/primitives/docs/overview/introduction
 */

import React, {
  forwardRef,
  createContext,
  useContext,
  ReactNode,
  HTMLAttributes,
} from "react";
import "./Card.css";
import {
  semanticColors,
  componentTokens,
  semanticElevation,
  primitiveSpace,
  StatusVariant,
} from "../../tokens";
import { Stack } from "../../primitives";
import { Text } from "../../primitives";
import { useKeyboardClick } from "../../hooks/useKeyboardClick";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type CardSize = "sm" | "md" | "lg";

interface CardContextValue {
  size: CardSize;
  interactive: boolean;
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Size preset affecting padding
   * @default "md"
   */
  size?: CardSize;

  /**
   * Legacy option for raised-at-rest cards
   */
  elevated?: boolean;

  /**
   * Status indicator (shows colored left border)
   */
  status?: StatusVariant;

  /**
   * Make the card interactive (clickable)
   */
  interactive?: boolean;

  /**
   * Selected state for interactive cards
   */
  selected?: boolean;

  /**
   * Disable internal padding (for custom layouts)
   */
  noPadding?: boolean;

  /**
   * Children
   */
  children?: ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

const CardContext = createContext<CardContextValue | null>(null);

function useCardContext() {
  const context = useContext(CardContext);
  // Allow standalone usage of subcomponents
  return context || { size: "md" as CardSize, interactive: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOUND COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Card.Header - Top section of the card
 */
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Add bottom border
   */
  bordered?: boolean;
  children?: ReactNode;
}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ bordered = false, children, style, ...props }, ref) => {
    const { size } = useCardContext();
    const padding = componentTokens.card.padding[size];

    return (
      <div
        ref={ref}
        style={{
          padding: `${padding}px ${padding}px ${bordered ? padding : padding / 2}px`,
          borderBottom: bordered ? `1px solid ${semanticColors.border.subtle}` : undefined,
          ...style,
        }}
        {...props}
      >
        <Stack direction="row" align="center" justify="space-between" gap={primitiveSpace[4]}>
          {children}
        </Stack>
      </div>
    );
  }
);
CardHeader.displayName = "Card.Header";

/**
 * Card.Title - Primary heading in header
 */
interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children?: ReactNode;
}

const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ children, style, ...props }, ref) => (
    <Text
      ref={ref}
      as="h3"
      variant="heading3"
      color="primary"
      style={{ flex: 1, ...style }}
      {...props}
    >
      {children}
    </Text>
  )
);
CardTitle.displayName = "Card.Title";

/**
 * Card.Subtitle - Secondary text in header
 */
interface CardSubtitleProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

const CardSubtitle = forwardRef<HTMLSpanElement, CardSubtitleProps>(
  ({ children, style, ...props }, ref) => (
    <Text
      ref={ref}
      as="span"
      variant="caption"
      color="tertiary"
      style={style}
      {...props}
    >
      {children}
    </Text>
  )
);
CardSubtitle.displayName = "Card.Subtitle";

/**
 * Card.Actions - Action buttons in header or footer
 */
interface CardActionsProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

const CardActions = forwardRef<HTMLDivElement, CardActionsProps>(
  ({ children, style, ...props }, ref) => (
    <Stack
      ref={ref}
      direction="row"
      align="center"
      gap={primitiveSpace[2]}
      style={{ flexShrink: 0, ...style }}
      {...props}
    >
      {children}
    </Stack>
  )
);
CardActions.displayName = "Card.Actions";

/**
 * Card.Body - Main content area
 */
interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

const CardBody = forwardRef<HTMLDivElement, CardBodyProps>(
  ({ children, style, ...props }, ref) => {
    const { size } = useCardContext();
    const padding = componentTokens.card.padding[size];

    return (
      <div
        ref={ref}
        style={{
          padding: padding,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CardBody.displayName = "Card.Body";

/**
 * Card.Footer - Bottom section of the card
 */
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Add top border
   */
  bordered?: boolean;
  children?: ReactNode;
}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ bordered = false, children, style, ...props }, ref) => {
    const { size } = useCardContext();
    const padding = componentTokens.card.padding[size];

    return (
      <div
        ref={ref}
        style={{
          padding: `${bordered ? padding : padding / 2}px ${padding}px ${padding}px`,
          borderTop: bordered ? `1px solid ${semanticColors.border.subtle}` : undefined,
          ...style,
        }}
        {...props}
      >
        <Stack direction="row" align="center" justify="flex-end" gap={primitiveSpace[3]}>
          {children}
        </Stack>
      </div>
    );
  }
);
CardFooter.displayName = "Card.Footer";

/**
 * Card.Section - Divided content section within body
 */
interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Add top border
   */
  bordered?: boolean;
  children?: ReactNode;
}

const CardSection = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ bordered = true, children, style, ...props }, ref) => {
    const { size } = useCardContext();
    const padding = componentTokens.card.padding[size];

    return (
      <div
        ref={ref}
        style={{
          padding: padding,
          borderTop: bordered ? `1px solid ${semanticColors.border.subtle}` : undefined,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CardSection.displayName = "Card.Section";

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const CardRoot = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      size = "md",
      elevated = false,
      status,
      interactive = false,
      selected = false,
      noPadding = false,
      children,
      style,
      onClick,
      className,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    const { padding, radius, elevation } = componentTokens.card;

    const isClickable = !!onClick;
    const isInteractive = interactive && isClickable;
    const keyboardClick = useKeyboardClick<HTMLDivElement>(isClickable ? onClick : undefined);

    // Determine if children use compound components or simple content
    const hasCompoundChildren = React.Children.toArray(children).some(
      (child) =>
        React.isValidElement(child) &&
        [CardHeader, CardBody, CardFooter, CardSection].some(
          (Comp) => child.type === Comp
        )
    );

    // Status border color
    const statusBorderColor = status
      ? semanticColors.status[status].foreground
      : "transparent";

    const restElevation = elevation.rest;
    const hoverElevation = elevated ? elevation.interactive : elevation.hover;

    return (
      <CardContext.Provider value={{ size, interactive: isInteractive }}>
        <div
          ref={ref}
          onClick={onClick}
          role={keyboardClick.role}
          tabIndex={keyboardClick.tabIndex}
          onKeyDown={(e) => {
            keyboardClick.onKeyDown?.(e);
            onKeyDown?.(e);
          }}
          className={["card", isInteractive ? "card--interactive" : null, className].filter(Boolean).join(" ")}
          style={{
            // Layout
            display: "flex",
            flexDirection: "column",
            // Appearance via CSS variables
            ["--card-bg" as any]: selected
              ? semanticColors.interactive.subtle
              : semanticColors.surface.default,
            ["--card-radius" as any]: `${radius}px`,
            ["--card-border" as any]: `1px solid ${
              selected ? semanticColors.interactive.default : semanticColors.border.subtle
            }`,
            ["--card-border-left" as any]: status
              ? `3px solid ${statusBorderColor}`
              : "initial",
            ["--card-shadow" as any]: semanticElevation[restElevation].shadow,
            ["--card-shadow-hover" as any]: semanticElevation[hoverElevation].shadow,
            // Padding (only if no compound children and not noPadding)
            padding: hasCompoundChildren || noPadding ? 0 : padding[size],
            ...style,
          }}
          {...props}
        >
          {children}
        </div>
      </CardContext.Provider>
    );
  }
);

CardRoot.displayName = "Card";

// ═══════════════════════════════════════════════════════════════════════════
// METRIC CARD VARIANT
// ═══════════════════════════════════════════════════════════════════════════

interface MetricCardProps extends Omit<CardProps, "children"> {
  /**
   * The metric value to display
   */
  value: string | number;

  /**
   * Label describing the metric
   */
  label: string;

  /**
   * Optional icon component
   */
  icon?: React.ComponentType<{ size: number; color: string }>;

  /**
   * Accent color for the value
   */
  color?: string;

  /**
   * Change percentage or description
   */
  change?: {
    value: number;
    label?: string;
  };
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  ({ value, label, icon: Icon, color, change, style, ...props }, ref) => (
    <Card ref={ref} style={{ position: "relative", overflow: "hidden", ...style }} {...props}>
      {color && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: color,
            opacity: 0.8,
          }}
          aria-hidden="true"
        />
      )}
      <Stack gap={primitiveSpace[3]}>
        <Stack direction="row" align="center" justify="space-between">
          <Text
            variant="display"
            style={{ color: color || semanticColors.text.primary }}
          >
            {value}
          </Text>
          {Icon && (
            <Icon size={24} color={semanticColors.text.tertiary} />
          )}
        </Stack>
        <Text variant="bodySm" color="secondary">
          {label}
        </Text>
        {change && (
          <Text
            variant="caption"
            style={{
              color:
                change.value >= 0
                  ? semanticColors.status.success.foreground
                  : semanticColors.status.danger.foreground,
            }}
          >
            {change.value >= 0 ? "↑" : "↓"} {Math.abs(change.value)}%
            {change.label && ` ${change.label}`}
          </Text>
        )}
      </Stack>
    </Card>
  )
);

MetricCard.displayName = "MetricCard";

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Title: CardTitle,
  Subtitle: CardSubtitle,
  Actions: CardActions,
  Body: CardBody,
  Footer: CardFooter,
  Section: CardSection,
});

export type { CardProps, CardSize };
export default Card;
