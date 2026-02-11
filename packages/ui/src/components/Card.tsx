/**
 * Card — Container for grouped content.
 *
 * Compound component with Header, Body, Footer, and Section slots.
 */

import React, {
  createContext,
  forwardRef,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";
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
  return context ?? { size: "md" as CardSize, interactive: false };
}

function cn(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

const cardPaddingClasses: Record<CardSize, string> = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const bodyPaddingClasses: Record<CardSize, string> = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const headerPaddingClasses: Record<CardSize, { bordered: string; unbordered: string }> = {
  sm: {
    bordered: "px-4 py-4",
    unbordered: "px-4 pt-4 pb-2",
  },
  md: {
    bordered: "px-5 py-5",
    unbordered: "px-5 pt-5 pb-2.5",
  },
  lg: {
    bordered: "px-6 py-6",
    unbordered: "px-6 pt-6 pb-3",
  },
};

const footerPaddingClasses: Record<CardSize, { bordered: string; unbordered: string }> = {
  sm: {
    bordered: "px-4 pt-4 pb-4",
    unbordered: "px-4 pt-2 pb-4",
  },
  md: {
    bordered: "px-5 pt-5 pb-5",
    unbordered: "px-5 pt-2.5 pb-5",
  },
  lg: {
    bordered: "px-6 pt-6 pb-6",
    unbordered: "px-6 pt-3 pb-6",
  },
};

const statusBorderClasses: Record<StatusVariant, string> = {
  success:
    "border-l-[3px] border-l-[var(--status-success)] dark:border-l-green-400",
  brand:
    "border-l-[3px] border-l-[var(--status-brand)] dark:border-l-blue-400",
  warning:
    "border-l-[3px] border-l-[var(--status-warning)] dark:border-l-amber-400",
  danger:
    "border-l-[3px] border-l-[var(--status-danger)] dark:border-l-red-400",
  info: "border-l-[3px] border-l-[var(--status-info)] dark:border-l-sky-400",
  neutral:
    "border-l-[3px] border-l-[var(--status-neutral)] dark:border-l-gray-400",
};

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
  children?: ReactNode;
}

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ bordered = false, children, className, ...props }, ref) => {
    const { size } = useCardContext();

    return (
      <div
        ref={ref}
        className={cn(
          bordered
            ? headerPaddingClasses[size].bordered
            : headerPaddingClasses[size].unbordered,
          bordered
            ? "border-b border-[var(--border-subtle)] dark:border-gray-700"
            : null,
          className,
        )}
        {...props}
      >
        <Stack direction="row" align="center" justify="space-between" gap={16}>
          {children}
        </Stack>
      </div>
    );
  },
);
CardHeader.displayName = "Card.Header";

const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement> & { children?: ReactNode }
>(({ children, className, ...props }, ref) => (
  <Text
    ref={ref}
    as="h3"
    variant="heading3"
    color="primary"
    className={cn("flex-1 dark:text-gray-100", className)}
    {...props}
  >
    {children}
  </Text>
));
CardTitle.displayName = "Card.Title";

const CardSubtitle = forwardRef<
  HTMLSpanElement,
  HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }
>(({ children, className, ...props }, ref) => (
  <Text
    ref={ref}
    as="span"
    variant="caption"
    color="tertiary"
    className={cn("dark:text-gray-400", className)}
    {...props}
  >
    {children}
  </Text>
));
CardSubtitle.displayName = "Card.Subtitle";

const CardActions = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
>(({ children, className, ...props }, ref) => (
  <Stack
    ref={ref}
    direction="row"
    align="center"
    gap={8}
    className={cn("shrink-0", className)}
    {...props}
  >
    {children}
  </Stack>
));
CardActions.displayName = "Card.Actions";

const CardBody = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { children?: ReactNode }
>(({ children, className, ...props }, ref) => {
  const { size } = useCardContext();

  return (
    <div ref={ref} className={cn(bodyPaddingClasses[size], className)} {...props}>
      {children}
    </div>
  );
});
CardBody.displayName = "Card.Body";

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
  children?: ReactNode;
}

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ bordered = false, children, className, ...props }, ref) => {
    const { size } = useCardContext();

    return (
      <div
        ref={ref}
        className={cn(
          bordered
            ? footerPaddingClasses[size].bordered
            : footerPaddingClasses[size].unbordered,
          bordered
            ? "border-t border-[var(--border-subtle)] dark:border-gray-700"
            : null,
          className,
        )}
        {...props}
      >
        <Stack direction="row" align="center" justify="flex-end" gap={12}>
          {children}
        </Stack>
      </div>
    );
  },
);
CardFooter.displayName = "Card.Footer";

interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
  bordered?: boolean;
  children?: ReactNode;
}

const CardSection = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ bordered = true, children, className, ...props }, ref) => {
    const { size } = useCardContext();

    return (
      <div
        ref={ref}
        className={cn(
          bodyPaddingClasses[size],
          bordered
            ? "border-t border-[var(--border-subtle)] dark:border-gray-700"
            : null,
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
CardSection.displayName = "Card.Section";

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
      onClick,
      className,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const isClickable = !!onClick;
    const isInteractive = interactive && isClickable;
    const keyboardClick = useKeyboardClick<HTMLDivElement>(
      isClickable ? onClick : undefined,
    );

    const hasCompoundChildren = React.Children.toArray(children).some(
      (child) =>
        React.isValidElement(child) &&
        [CardHeader, CardBody, CardFooter, CardSection].some(
          (Comp) => child.type === Comp,
        ),
    );

    const computedClassName = cn(
      "pp-card flex flex-col rounded-[10px] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-[var(--elevation-e0)] transition-[box-shadow,border-color,background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
      isInteractive
        ? "pp-card--interactive cursor-pointer hover:shadow-[var(--elevation-e1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)]"
        : null,
      selected
        ? "border-[var(--interactive-primary)] bg-[var(--interactive-subtle)] dark:border-blue-500 dark:bg-blue-950/30"
        : null,
      status ? statusBorderClasses[status] : null,
      elevated ? "shadow-[var(--elevation-e1)]" : null,
      hasCompoundChildren || noPadding ? "p-0" : cardPaddingClasses[size],
      className,
    );

    return (
      <CardContext.Provider value={{ size, interactive: isInteractive }}>
        <div
          ref={ref}
          onClick={onClick}
          role={keyboardClick.role}
          tabIndex={keyboardClick.tabIndex}
          onKeyDown={(event) => {
            keyboardClick.onKeyDown?.(event);
            onKeyDown?.(event);
          }}
          className={computedClassName}
          {...props}
        >
          {children}
        </div>
      </CardContext.Provider>
    );
  },
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
