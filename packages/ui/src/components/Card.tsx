/**
 * Card — Container for grouped content
 *
 * Compound component with Header, Body, Footer, Section slots.
 */

import React, {
  forwardRef,
  createContext,
  useContext,
  type ReactNode,
  type HTMLAttributes,
} from "react";
import {
  semanticColors,
  componentTokens,
  semanticElevation,
  primitiveSpace,
} from "../tokens";
import type { StatusVariant } from "../tokens";
import { Stack } from "../primitives/Stack";
import { Text } from "../primitives/Text";
import { useKeyboardClick } from "../hooks/useKeyboardClick";

type CardSize = "sm" | "md" | "lg";

interface CardContextValue {
  size: CardSize;
  interactive: boolean;
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  size?: CardSize;
  elevated?: boolean;
  status?: StatusVariant;
  interactive?: boolean;
  selected?: boolean;
  noPadding?: boolean;
  children?: ReactNode;
}

const CardContext = createContext<CardContextValue | null>(null);

function useCardContext() {
  const context = useContext(CardContext);
  return context || { size: "md" as CardSize, interactive: false };
}

// Card.Header
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
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

// Card.Title
const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement> & { children?: ReactNode }>(
  ({ children, style, ...props }, ref) => (
    <Text ref={ref} as="h3" variant="heading3" color="primary" style={{ flex: 1, ...style }} {...props}>
      {children}
    </Text>
  )
);
CardTitle.displayName = "Card.Title";

// Card.Subtitle
const CardSubtitle = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }>(
  ({ children, style, ...props }, ref) => (
    <Text ref={ref} as="span" variant="caption" color="tertiary" style={style} {...props}>
      {children}
    </Text>
  )
);
CardSubtitle.displayName = "Card.Subtitle";

// Card.Actions
const CardActions = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { children?: ReactNode }>(
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

// Card.Body
const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { children?: ReactNode }>(
  ({ children, style, ...props }, ref) => {
    const { size } = useCardContext();
    const padding = componentTokens.card.padding[size];

    return (
      <div ref={ref} style={{ padding, ...style }} {...props}>
        {children}
      </div>
    );
  }
);
CardBody.displayName = "Card.Body";

// Card.Footer
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
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

// Card.Section
interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
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
          padding,
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

// Main Card
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

    const hasCompoundChildren = React.Children.toArray(children).some(
      (child) =>
        React.isValidElement(child) &&
        [CardHeader, CardBody, CardFooter, CardSection].some(
          (Comp) => child.type === Comp
        )
    );

    const statusBorderColor = status
      ? semanticColors.status[status].foreground
      : "transparent";

    const restElevation = elevation.rest;
    const hoverElevation = elevated ? elevation.interactive : elevation.hover;

    const computedClassName = [
      "pp-card",
      isInteractive ? "pp-card--interactive" : null,
      className,
    ].filter(Boolean).join(" ");

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
          className={computedClassName}
          style={{
            display: "flex",
            flexDirection: "column",
            background: selected
              ? semanticColors.interactive.subtle
              : semanticColors.surface.default,
            borderRadius: `${radius}px`,
            border: `1px solid ${
              selected ? semanticColors.interactive.default : semanticColors.border.subtle
            }`,
            borderLeft: status ? `3px solid ${statusBorderColor}` : undefined,
            boxShadow: semanticElevation[restElevation].shadow,
            padding: hasCompoundChildren || noPadding ? 0 : padding[size],
            cursor: isInteractive ? "pointer" : undefined,
            transition: `box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), background 150ms cubic-bezier(0.4, 0, 0.2, 1)`,
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
