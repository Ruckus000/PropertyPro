/**
 * Skeleton - Placeholder while content is loading
 */

import React, { CSSProperties, HTMLAttributes, forwardRef } from "react";
import { primitiveRadius, semanticColors } from "../../tokens";

export type SkeletonVariant = "text" | "rect" | "circle";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  variant?: SkeletonVariant;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ width, height, variant = "text", style, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      data-pp-skeleton
      style={{
        width: width || (variant === "text" ? "100%" : undefined),
        height: height || (variant === "text" ? "1em" : variant === "circle" ? width : undefined),
        borderRadius: variant === "circle" ? primitiveRadius.full : primitiveRadius.sm,
        background: semanticColors.surface.muted,
        ...style,
      }}
      {...props}
    />
  )
);

Skeleton.displayName = "Skeleton";

export default Skeleton;
