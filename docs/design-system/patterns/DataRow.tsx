/**
 * DataRow - Table-like row for data display
 *
 * A flexible row component for displaying data in a structured format.
 * Supports grid-based columns, status indicators, and interactive states.
 *
 * @example
 * <DataRow columns="100px 1fr 120px" status="success" onClick={handleClick}>
 *   <StatusBadge status="compliant" />
 *   <Text variant="bodySm">Declaration of Condominium</Text>
 *   <Text variant="caption" color="tertiary">Jan 15, 2026</Text>
 * </DataRow>
 *
 * @see https://www.radix-ui.com/primitives
 */

import React, { forwardRef, HTMLAttributes, ReactNode } from "react";
import "./DataRow.css";
import {
  semanticColors,
  primitiveFonts,
  primitiveSpace,
  primitiveRadius,
  StatusVariant,
} from "../tokens";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type DataRowBaseProps = {
  /**
   * CSS Grid column template (e.g., "100px 1fr 120px")
   */
  columns?: string;

  /**
   * Status indicator (shows colored left border)
   */
  status?: StatusVariant;

  /**
   * Selected state
   */
  selected?: boolean;

  /**
   * Disable hover effects
   */
  disableHover?: boolean;

  /**
   * Compact mode with reduced padding
   */
  compact?: boolean;

  /**
   * Children
   */
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

type DataRowInteractiveProps = DataRowBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof DataRowBaseProps | "onClick"> & {
    onClick: React.MouseEventHandler<HTMLButtonElement>;
  };

type DataRowStaticProps = DataRowBaseProps &
  Omit<React.HTMLAttributes<HTMLDivElement>, keyof DataRowBaseProps | "onClick"> & {
    onClick?: undefined;
  };

export type DataRowProps = DataRowInteractiveProps | DataRowStaticProps;

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const DataRow = forwardRef<HTMLButtonElement | HTMLDivElement, DataRowProps>(
  (
    {
      columns,
      status,
      selected = false,
      disableHover = false,
      compact = false,
      children,
      onClick,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const isInteractive = typeof onClick === "function";
    const padding = compact ? primitiveSpace[2] : primitiveSpace[3];
    const gap = primitiveSpace[3];

    // Status border color
    const statusBorderColor = status
      ? semanticColors.status[status].foreground
      : "transparent";

    const baseBg = selected
      ? semanticColors.interactive.subtle
      : semanticColors.surface.default;

    const hoverBg =
      disableHover || selected ? baseBg : semanticColors.surface.subtle;

    const computedClassName = [
      "data-row",
      isInteractive ? "data-row--interactive" : null,
      disableHover ? "data-row--disableHover" : null,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const computedStyle: React.CSSProperties = {
      display: columns ? "grid" : "flex",
      gridTemplateColumns: columns,
      alignItems: "center",
      gap,
      padding: `${padding}px ${primitiveSpace[4]}px`,
      borderRadius: primitiveRadius.md,
      width: "100%",
      textAlign: "left",
      border: "none",
      appearance: "none",
      ["--data-row-bg" as any]: baseBg,
      ["--data-row-bg-hover" as any]: hoverBg,
      ["--data-row-radius" as any]: `${primitiveRadius.md}px`,
      ["--data-row-status-border" as any]: status
        ? `3px solid ${statusBorderColor}`
        : "3px solid transparent",
      ...style,
    };

    if (isInteractive) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          className={computedClassName}
          style={computedStyle}
          {...(props as Omit<
            React.ButtonHTMLAttributes<HTMLButtonElement>,
            keyof DataRowBaseProps
          >)}
        >
          {children}
        </button>
      );
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        role="row"
        className={computedClassName}
        style={computedStyle}
        {...(props as Omit<
          React.HTMLAttributes<HTMLDivElement>,
          keyof DataRowBaseProps
        >)}
      >
        {children}
      </div>
    );
  }
);

DataRow.displayName = "DataRow";

// ═══════════════════════════════════════════════════════════════════════════
// COLUMN HEADER
// ═══════════════════════════════════════════════════════════════════════════

interface ColumnHeaderProps extends HTMLAttributes<HTMLTableCellElement> {
  /**
   * Fixed width
   */
  width?: number | string;

  /**
   * Flex grow
   */
  flex?: number;

  /**
   * Text alignment
   */
  align?: "left" | "center" | "right";

  /**
   * Children
   */
  children?: ReactNode;
}

export const ColumnHeader = forwardRef<HTMLTableCellElement, ColumnHeaderProps>(
  ({ width, flex, align = "left", children, style, ...props }, ref) => (
    <th
      ref={ref}
      scope="col"
      style={{
        width,
        flex,
        textAlign: align,
        fontSize: primitiveFonts.size.xs,
        fontWeight: primitiveFonts.weight.semibold,
        color: semanticColors.text.tertiary,
        textTransform: "uppercase",
        letterSpacing: primitiveFonts.letterSpacing.wider,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
      {...props}
    >
      {children}
    </th>
  )
);

ColumnHeader.displayName = "ColumnHeader";

// ═══════════════════════════════════════════════════════════════════════════
// DATA TABLE HEADER ROW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DataHeaderRow - Header row for data tables
 *
 * Children should be ColumnHeader components which render as <th scope="col">.
 * When used with DataRow, creates an accessible table structure.
 */

interface DataHeaderRowProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * CSS Grid column template (should match DataRow columns)
   */
  columns?: string;

  /**
   * Children (should be ColumnHeader components)
   */
  children?: ReactNode;
}

export const DataHeaderRow = forwardRef<HTMLDivElement, DataHeaderRowProps>(
  ({ columns, children, style, ...props }, ref) => (
    <div
      ref={ref}
      role="row"
      style={{
        display: columns ? "grid" : "flex",
        gridTemplateColumns: columns,
        alignItems: "center",
        gap: primitiveSpace[3],
        padding: `${primitiveSpace[2]}px ${primitiveSpace[4]}px`,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
);

DataHeaderRow.displayName = "DataHeaderRow";

export default DataRow;
