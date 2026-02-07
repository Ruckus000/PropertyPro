/**
 * Button - Interactive element for user actions
 *
 * Implements compound component pattern for flexible composition.
 * Supports icons, loading states, and multiple variants.
 *
 * @example
 * // Simple usage
 * <Button variant="primary">Click me</Button>
 *
 * // With icon
 * <Button variant="secondary" size="sm">
 *   <Button.Icon><PlusIcon /></Button.Icon>
 *   <Button.Label>Add item</Button.Label>
 * </Button>
 *
 * // Icon only
 * <Button variant="ghost" size="sm" aria-label="Settings">
 *   <Button.Icon><SettingsIcon /></Button.Icon>
 * </Button>
 *
 * @see https://www.patterns.dev/react/compound-pattern/
 * @see https://www.radix-ui.com/primitives/docs/overview/introduction
 */

import React, {
  forwardRef,
  createContext,
  useContext,
  useMemo,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import "./Button.css";
import {
  semanticColors,
  componentTokens,
  primitiveFonts,
} from "../../tokens";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonContextValue {
  size: ButtonSize;
  variant: ButtonVariant;
  disabled: boolean;
}

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /**
   * Visual variant of the button
   * @default "primary"
   */
  variant?: ButtonVariant;

  /**
   * Size preset
   * @default "md"
   */
  size?: ButtonSize;

  /**
   * Full width button
   */
  fullWidth?: boolean;

  /**
   * Shorthand icon before the label (simple mode)
   */
  leftIcon?: ReactNode;

  /**
   * Shorthand icon after the label (simple mode)
   */
  rightIcon?: ReactNode;

  /**
   * Loading state - shows spinner and disables interaction
   */
  loading?: boolean;

  /**
   * Children (supports compound components or simple text)
   */
  children?: ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT
// ═══════════════════════════════════════════════════════════════════════════

const ButtonContext = createContext<ButtonContextValue | null>(null);

function useButtonContext() {
  const context = useContext(ButtonContext);
  if (!context) {
    throw new Error("Button compound components must be used within a Button");
  }
  return context;
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getVariantVars(variant: ButtonVariant) {
  switch (variant) {
    case "primary":
      return {
        bg: semanticColors.interactive.default,
        bgHover: semanticColors.interactive.hover,
        bgActive: semanticColors.interactive.active,
        color: semanticColors.text.inverse,
        border: "none",
      };
    case "secondary":
      return {
        bg: "transparent",
        bgHover: semanticColors.surface.subtle,
        bgActive: semanticColors.surface.muted,
        color: semanticColors.text.primary,
        border: `1px solid ${semanticColors.border.default}`,
      };
    case "ghost":
      return {
        bg: "transparent",
        bgHover: semanticColors.surface.subtle,
        bgActive: semanticColors.surface.muted,
        color: semanticColors.text.secondary,
        border: "none",
      };
    case "danger":
      return {
        bg: semanticColors.status.danger.background,
        bgHover: semanticColors.status.danger.foreground,
        bgActive: semanticColors.status.danger.foreground,
        color: semanticColors.status.danger.foreground,
        colorHover: semanticColors.text.inverse,
        border: `1px solid ${semanticColors.status.danger.border}`,
      };
    case "link":
      return {
        bg: "transparent",
        bgHover: "transparent",
        bgActive: "transparent",
        color: semanticColors.text.link,
        colorHover: semanticColors.text.linkHover,
        border: "none",
        textDecoration: "none",
        textDecorationHover: "underline",
      };
    default: {
      const exhaustiveCheck: never = variant;
      return exhaustiveCheck;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOUND COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Button.Icon - Icon slot for the button
 */
interface ButtonIconProps {
  children: ReactNode;
  /** Position relative to label */
  position?: "start" | "end";
}

const ButtonIcon: React.FC<ButtonIconProps> = ({ children, position = "start" }) => {
  const { size } = useButtonContext();
  const iconSize = componentTokens.button.iconSize[size];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: iconSize,
        height: iconSize,
        flexShrink: 0,
        order: position === "end" ? 1 : 0,
      }}
      aria-hidden="true"
    >
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ size?: number }>, {
            size: iconSize,
          })
        : children}
    </span>
  );
};
ButtonIcon.displayName = "Button.Icon";

/**
 * Button.Label - Text label for the button
 */
interface ButtonLabelProps {
  children: ReactNode;
}

const ButtonLabel: React.FC<ButtonLabelProps> = ({ children }) => {
  return <span style={{ order: 0 }}>{children}</span>;
};
ButtonLabel.displayName = "Button.Label";

/**
 * Button.Spinner - Loading indicator
 */
const ButtonSpinner: React.FC = () => {
  const { size } = useButtonContext();
  const spinnerSize = componentTokens.button.iconSize[size];

  return (
    <svg
      width={spinnerSize}
      height={spinnerSize}
      viewBox="0 0 24 24"
      fill="none"
      style={{
        animation: "button-spin 1s linear infinite",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        opacity="0.25"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="31.4 31.4"
        strokeDashoffset="62.8"
        style={{ transformOrigin: "center" }}
      />
      <style>{`
        @keyframes button-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
};
ButtonSpinner.displayName = "Button.Spinner";

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

const ButtonRoot = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth = false,
      leftIcon,
      rightIcon,
      loading = false,
      disabled = false,
      children,
      style,
      className,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    // Context for compound components
    const contextValue = useMemo<ButtonContextValue>(
      () => ({
        size,
        variant,
        disabled: isDisabled,
      }),
      [size, variant, isDisabled]
    );

    // Get size tokens
    const { height, padding, gap } = componentTokens.button;

    const variantVars = getVariantVars(variant);

    const containsCompoundChildren = (node: ReactNode): boolean => {
      if (node === null || node === undefined) return false;
      if (Array.isArray(node)) return node.some(containsCompoundChildren);
      if (!React.isValidElement(node)) return false;
      if (node.type === ButtonIcon || node.type === ButtonLabel) return true;
      if (node.type === React.Fragment) {
        return containsCompoundChildren((node.props as { children?: ReactNode }).children);
      }
      return containsCompoundChildren((node.props as { children?: ReactNode }).children);
    };

    const hasCompoundChildren = containsCompoundChildren(children);
    const showSimpleIcons = !hasCompoundChildren && (leftIcon || rightIcon);

    // Determine if children is simple text or compound components
    const isSimpleText = typeof children === "string" || typeof children === "number";
    const isSimpleLayout = isSimpleText && !showSimpleIcons;

    const computedClassName = [
      "button",
      `button--${variant}`,
      `button--${size}`,
      fullWidth ? "button--fullWidth" : null,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const fontSize = size === "lg" ? primitiveFonts.size.base : primitiveFonts.size.sm;

    const baseVars: React.CSSProperties = {
      ["--button-height" as any]: `${height[size]}px`,
      ["--button-padding" as any]: isSimpleLayout
        ? `0 ${padding[size]}px`
        : `0 ${padding[size] - 4}px`,
      ["--button-width" as any]: fullWidth ? "100%" : "auto",
      ["--button-gap" as any]: `${gap}px`,
      ["--button-radius" as any]: `${componentTokens.button.radius}px`,
      ["--button-font-family" as any]: primitiveFonts.family.sans,
      ["--button-font-size" as any]: fontSize,
      ["--button-font-weight" as any]: primitiveFonts.weight.medium,
      ["--button-bg" as any]: variantVars.bg,
      ["--button-bg-hover" as any]: variantVars.bgHover,
      ["--button-bg-active" as any]: variantVars.bgActive,
      ["--button-color" as any]: variantVars.color,
      ["--button-color-hover" as any]: variantVars.colorHover ?? variantVars.color,
      ["--button-border" as any]: variantVars.border,
      ["--button-text-decoration" as any]: variantVars.textDecoration ?? "none",
      ["--button-text-decoration-hover" as any]:
        variantVars.textDecorationHover ?? variantVars.textDecoration ?? "none",
    };

    const disabledVars: React.CSSProperties = isDisabled
      ? {
          ["--button-bg" as any]:
            variant === "link" ? "transparent" : semanticColors.surface.muted,
          ["--button-bg-hover" as any]:
            variant === "link" ? "transparent" : semanticColors.surface.muted,
          ["--button-bg-active" as any]:
            variant === "link" ? "transparent" : semanticColors.surface.muted,
          ["--button-color" as any]: semanticColors.text.disabled,
          ["--button-color-hover" as any]: semanticColors.text.disabled,
          ["--button-border" as any]:
            variant === "secondary"
              ? `1px solid ${semanticColors.border.subtle}`
              : variantVars.border,
          ["--button-text-decoration" as any]: "none",
          ["--button-text-decoration-hover" as any]: "none",
        }
      : {};

    return (
      <ButtonContext.Provider value={contextValue}>
        <button
          ref={ref}
          disabled={isDisabled}
          data-loading={loading ? "true" : "false"}
          className={computedClassName}
          style={{
            ...baseVars,
            ...disabledVars,
            // Custom override
            ...style,
          }}
          {...props}
        >
          {loading && <ButtonSpinner />}
          {!loading && showSimpleIcons ? (
            <>
              {leftIcon && <ButtonIcon>{leftIcon}</ButtonIcon>}
              <span>{children}</span>
              {rightIcon && <ButtonIcon position="end">{rightIcon}</ButtonIcon>}
            </>
          ) : (
            !loading && children
          )}
        </button>
      </ButtonContext.Provider>
    );
  }
);

ButtonRoot.displayName = "Button";

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

// Compound component assembly
export const Button = Object.assign(ButtonRoot, {
  Icon: ButtonIcon,
  Label: ButtonLabel,
  Spinner: ButtonSpinner,
});

export type { ButtonProps, ButtonVariant, ButtonSize };
export default Button;
