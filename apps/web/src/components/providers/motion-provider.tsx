"use client";

import { MotionConfig } from "framer-motion";
import { primitiveMotion } from "@propertypro/ui/tokens";
import type { ReactNode } from "react";

/**
 * Global motion provider — sets default transition from our motion tokens.
 * Reduced-motion is handled automatically by framer-motion's internal detection.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      transition={{
        duration: primitiveMotion.duration.standard / 1000,
        ease: [0.4, 0, 0.2, 1], // standard easing
      }}
      reducedMotion="user"
    >
      {children}
    </MotionConfig>
  );
}
