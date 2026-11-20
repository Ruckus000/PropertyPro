/**
 * The frame every empty-state scene renders in.
 *
 * Spec: docs/design-system/patterns/empty-states.md §3 and §5. A scene is
 * decorative: the heading and body beside it already say everything, so the
 * svg is always hidden from assistive tech and never takes focus. The art box
 * is sized in rem so it grows with the fluid app root; the viewBox scales
 * inside it.
 */

import * as React from "react";
import { cn } from "../utils/cn";

export type SceneSize = "hero" | "section" | "compact";

/** Every scene composition takes this. */
export interface SceneProps {
  size?: SceneSize;
  className?: string;
}

/** Art box per size: hero 20rem (spec 18–22), section 10rem, compact 5rem (spec 4.5–6). */
const ART_BOX: Record<SceneSize, string> = {
  hero: "w-80 max-w-full",
  section: "w-40 max-w-full",
  compact: "w-20",
};

/** viewBox of the landscape compositions (hero and section) and of the compact vignettes. */
const LANDSCAPE_VIEWBOX = "0 0 340 230";
const VIGNETTE_VIEWBOX = "0 0 64 64";

export function Scene({
  size = "hero",
  className,
  children,
}: SceneProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox={size === "compact" ? VIGNETTE_VIEWBOX : LANDSCAPE_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      className={cn("block h-auto shrink-0", ART_BOX[size], className)}
    >
      {children}
    </svg>
  );
}
