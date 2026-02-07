import React from "react";

export function useKeyboardClick<T extends HTMLElement>(
  onClick?: React.MouseEventHandler<T>
) {
  return {
    onKeyDown: (e: React.KeyboardEvent<T>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(e as unknown as React.MouseEvent<T>);
      }
    },
    onClick,
    tabIndex: onClick ? 0 : undefined,
    role: onClick ? ("button" as const) : undefined,
  };
}

