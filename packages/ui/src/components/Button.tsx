/**
 * Button — Interactive element for user actions
 *
 * Compound component pattern with Icon, Label, Spinner slots.
 * 5 variants: primary, secondary, ghost, danger, link
 * 3 sizes: sm, md, lg
 */

import React, {
  forwardRef,
  createContext,
  useContext,
  useMemo,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { semanticColors, componentTokens, primitiveFonts } from "../tokens";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonContextValue {
  size: ButtonSize;
  variant: ButtonVariant;
  disabled: boolean;
}

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  children?: ReactNode;
}

const ButtonContext = createContext<ButtonContextValue | null>(null);

function useButtonContext() {
  const context = useContext(ButtonContext);
  if (!context) {
    throw new Error("Button compound components must be used within a Button");
  }
  return context;
}

interface VariantVars {
  bg: string;
  bgHover: string;
  bgActive: string;
  color: string;
  colorHover?: string;
  border: string;
  textDecoration?: string;
  textDecorationHover?: string;
}

function getVariantVars(variant: ButtonVariant): VariantVars {
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
      const _exhaustiveCheck: never = variant;
      return _exhaustiveCheck;
    }
  }
}

// Compound: Button.Icon
interface ButtonIconProps {
  children: ReactNode;
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
        ? React.cloneElement(children as React.ReactElement<{ size?: number }>, { size: iconSize })
        : children}
    </span>
  );
};
ButtonIcon.displayName = "Button.Icon";

// Compound: Button.Label
const ButtonLabel: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <span style={{ order: 0 }}>{children}</span>;
};
ButtonLabel.displayName = "Button.Label";

// Compound: Button.Spinner
const ButtonSpinner: React.FC = () => {
  const { size } = useButtonContext();
  const spinnerSize = componentTokens.button.iconSize[size];

  return (
    <svg
      width={spinnerSize}
      height={spinnerSize}
      viewBox="0 0 24 24"
      fill="none"
      className="button-spinner"
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
    </svg>
  );
};
ButtonSpinner.displayName = "Button.Spinner";

// Main component
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

    const contextValue = useMemo<ButtonContextValue>(
      () => ({ size, variant, disabled: isDisabled }),
      [size, variant, isDisabled]
    );

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
    const isSimpleText = typeof children === "string" || typeof children === "number";
    const isSimpleLayout = isSimpleText && !showSimpleIcons;

    const computedClassName = [
      "pp-button",
      `pp-button--${variant}`,
      `pp-button--${size}`,
      fullWidth ? "pp-button--fullWidth" : null,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const fontSize = size === "lg" ? primitiveFonts.size.base : primitiveFonts.size.sm;
    const resolvedHeight = size === "md" ? "var(--button-height, 40px)" : `${height[size]}px`;
    const resolvedGap = size === "md" ? "var(--component-gap, 8px)" : `${gap}px`;
    const resolvedPadding = size === "md"
      ? isSimpleLayout
        ? "0 var(--component-padding, 16px)"
        : "0 calc(var(--component-padding, 16px) - 4px)"
      : isSimpleLayout
        ? `0 ${padding[size]}px`
        : `0 ${padding[size] - 4}px`;

    const baseVars: Record<string, string> = {
      "--pp-btn-height": resolvedHeight,
      "--pp-btn-padding": resolvedPadding,
      "--pp-btn-width": fullWidth ? "100%" : "auto",
      "--pp-btn-gap": resolvedGap,
      "--pp-btn-radius": `${componentTokens.button.radius}px`,
      "--pp-btn-font-family": primitiveFonts.family.sans,
      "--pp-btn-font-size": fontSize,
      "--pp-btn-font-weight": String(primitiveFonts.weight.medium),
      "--pp-btn-bg": variantVars.bg,
      "--pp-btn-bg-hover": variantVars.bgHover,
      "--pp-btn-bg-active": variantVars.bgActive,
      "--pp-btn-color": variantVars.color,
      "--pp-btn-color-hover": variantVars.colorHover ?? variantVars.color,
      "--pp-btn-border": variantVars.border,
      "--pp-btn-text-decoration": variantVars.textDecoration ?? "none",
      "--pp-btn-text-decoration-hover": variantVars.textDecorationHover ?? variantVars.textDecoration ?? "none",
    };

    if (isDisabled) {
      baseVars["--pp-btn-bg"] = variant === "link" ? "transparent" : semanticColors.surface.muted;
      baseVars["--pp-btn-bg-hover"] = variant === "link" ? "transparent" : semanticColors.surface.muted;
      baseVars["--pp-btn-bg-active"] = variant === "link" ? "transparent" : semanticColors.surface.muted;
      baseVars["--pp-btn-color"] = semanticColors.text.disabled;
      baseVars["--pp-btn-color-hover"] = semanticColors.text.disabled;
      if (variant === "secondary") {
        baseVars["--pp-btn-border"] = `1px solid ${semanticColors.border.subtle}`;
      }
      baseVars["--pp-btn-text-decoration"] = "none";
      baseVars["--pp-btn-text-decoration-hover"] = "none";
    }

    const inlineStyles: React.CSSProperties = {
      appearance: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: resolvedGap,
      height: resolvedHeight,
      padding: resolvedPadding,
      width: fullWidth ? "100%" : "auto",
      fontFamily: primitiveFonts.family.sans,
      fontSize,
      fontWeight: primitiveFonts.weight.medium,
      lineHeight: 1,
      textDecoration: variantVars.textDecoration ?? "none",
      color: baseVars["--pp-btn-color"],
      background: baseVars["--pp-btn-bg"],
      border: baseVars["--pp-btn-border"],
      borderRadius: `${componentTokens.button.radius}px`,
      cursor: isDisabled ? "not-allowed" : "pointer",
      opacity: loading ? 0.7 : 1,
      pointerEvents: loading ? "none" : "auto",
      transition: `background 100ms cubic-bezier(0.4, 0, 0.2, 1), color 100ms cubic-bezier(0.4, 0, 0.2, 1), border-color 100ms cubic-bezier(0.4, 0, 0.2, 1)`,
      ...style,
    };

    return (
      <ButtonContext.Provider value={contextValue}>
        <button
          ref={ref}
          disabled={isDisabled}
          data-loading={loading ? "true" : "false"}
          className={computedClassName}
          style={inlineStyles}
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

export const Button = Object.assign(ButtonRoot, {
  Icon: ButtonIcon,
  Label: ButtonLabel,
  Spinner: ButtonSpinner,
});

export type { ButtonProps, ButtonVariant, ButtonSize };
export default Button;
