/**
 * Spinner - Simple SVG loading indicator
 */

import React, { SVGAttributes, forwardRef } from "react";

export interface SpinnerProps extends SVGAttributes<SVGSVGElement> {
  size?: number;
  label?: string;
}

export const Spinner = forwardRef<SVGSVGElement, SpinnerProps>(
  ({ size = 16, label, style, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{
        animation: "pp-spinner-spin 1s linear infinite",
        flexShrink: 0,
        ...style,
      }}
      {...props}
    >
      {/* Background track — full ring at 25% opacity */}
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.25"
      />
      {/* Spinning arc — ~25% of circumference visible (62.83 * 0.25 ≈ 15.7) */}
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="15.7 47.1"
      />
      <style>{`
        @keyframes pp-spinner-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  )
);

Spinner.displayName = "Spinner";

export default Spinner;
