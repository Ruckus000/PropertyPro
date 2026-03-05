'use client';

/**
 * Button — Interactive element for user actions.
 *
 * Class-based styling with explicit dark variants.
 */

import React, {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonContextValue {
  size: ButtonSize;
  variant: ButtonVariant;
  disabled: boolean;
}

interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
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

function cn(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm gap-2",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2.5",
};

const iconSizeClasses: Record<ButtonSize, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-[18px]",
};

const iconSizes: Record<ButtonSize, number> = {
  sm: 14,
  md: 16,
  lg: 18,
};

const spinnerSizeClasses: Record<ButtonSize, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-[18px]",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-[var(--interactive-primary)] text-[var(--text-inverse)] hover:bg-[var(--interactive-primary-hover)] active:bg-[var(--interactive-primary-active)] dark:bg-blue-500 dark:text-gray-950 dark:hover:bg-blue-400 dark:active:bg-blue-300",
  secondary:
    "border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] active:bg-[var(--surface-muted)] dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800 dark:active:bg-gray-700",
  ghost:
    "border border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] active:bg-[var(--surface-muted)] dark:text-gray-300 dark:hover:bg-gray-800 dark:active:bg-gray-700",
  danger:
    "border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger)] hover:bg-[var(--status-danger)] hover:text-[var(--text-inverse)] active:bg-[var(--status-danger)] active:text-[var(--text-inverse)] dark:border-red-400 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-500 dark:hover:text-white dark:active:bg-red-600",
  link:
    "border border-transparent bg-transparent px-0 text-[var(--text-link)] hover:text-[var(--text-link-hover)] hover:underline active:underline dark:text-blue-300 dark:hover:text-blue-200",
};

const disabledClassesByVariant: Record<ButtonVariant, string> = {
  primary:
    "disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-disabled)] dark:disabled:border-gray-700 dark:disabled:bg-gray-800 dark:disabled:text-gray-500",
  secondary:
    "disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-disabled)] dark:disabled:border-gray-700 dark:disabled:bg-gray-800 dark:disabled:text-gray-500",
  ghost:
    "disabled:border-transparent disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-disabled)] dark:disabled:bg-gray-800 dark:disabled:text-gray-500",
  danger:
    "disabled:border-[var(--border-subtle)] disabled:bg-[var(--surface-muted)] disabled:text-[var(--text-disabled)] dark:disabled:border-gray-700 dark:disabled:bg-gray-800 dark:disabled:text-gray-500",
  link:
    "disabled:border-transparent disabled:bg-transparent disabled:text-[var(--text-disabled)] disabled:no-underline dark:disabled:text-gray-500",
};

interface ButtonIconProps {
  children: ReactNode;
  position?: "start" | "end";
}

const ButtonIcon: React.FC<ButtonIconProps> = ({
  children,
  position = "start",
}) => {
  const { size } = useButtonContext();
  const iconSize = iconSizes[size];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        iconSizeClasses[size],
        position === "end" ? "order-1" : null,
      )}
      aria-hidden="true"
    >
      {React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<{ size?: number }>,
            { size: iconSize },
          )
        : children}
    </span>
  );
};
ButtonIcon.displayName = "Button.Icon";

const ButtonLabel: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <span>{children}</span>;
};
ButtonLabel.displayName = "Button.Label";

const ButtonSpinner: React.FC = () => {
  const { size } = useButtonContext();

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn(
        "button-spinner animate-spin",
        spinnerSizeClasses[size],
      )}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
};
ButtonSpinner.displayName = "Button.Spinner";

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
      className,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    const contextValue = useMemo<ButtonContextValue>(
      () => ({ size, variant, disabled: isDisabled }),
      [size, variant, isDisabled],
    );

    const containsCompoundChildren = (node: ReactNode): boolean => {
      if (node === null || node === undefined) return false;
      if (Array.isArray(node)) return node.some(containsCompoundChildren);
      if (!React.isValidElement(node)) return false;
      if (node.type === ButtonIcon || node.type === ButtonLabel) return true;
      if (node.type === React.Fragment) {
        return containsCompoundChildren(
          (node.props as { children?: ReactNode }).children,
        );
      }
      return containsCompoundChildren(
        (node.props as { children?: ReactNode }).children,
      );
    };

    const hasCompoundChildren = containsCompoundChildren(children);
    const showSimpleIcons = !hasCompoundChildren && (leftIcon || rightIcon);

    const computedClassName = cn(
      "pp-button inline-flex items-center justify-center rounded-[10px] font-medium leading-none transition-colors duration-100 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-page)] disabled:cursor-not-allowed disabled:pointer-events-none",
      `pp-button--${variant}`,
      `pp-button--${size}`,
      sizeClasses[size],
      variantClasses[variant],
      disabledClassesByVariant[variant],
      fullWidth ? "pp-button--fullWidth w-full" : "w-auto",
      loading ? "opacity-70 pointer-events-none" : null,
      className,
    );

    return (
      <ButtonContext.Provider value={contextValue}>
        <button
          ref={ref}
          disabled={isDisabled}
          data-loading={loading ? "true" : "false"}
          className={computedClassName}
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
  },
);

ButtonRoot.displayName = "Button";

export const Button = Object.assign(ButtonRoot, {
  Icon: ButtonIcon,
  Label: ButtonLabel,
  Spinner: ButtonSpinner,
});

export type { ButtonProps, ButtonVariant, ButtonSize };
export default Button;
