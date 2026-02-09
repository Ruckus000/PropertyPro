/**
 * Motion tokens — durations, easing curves, semantic motion
 */

export const primitiveMotion = {
  duration: {
    instant: 0,
    micro: 100,
    quick: 150,
    standard: 250,
    slow: 350,
    expressive: 500,
  },
  easing: {
    linear: "linear",
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    enter: "cubic-bezier(0, 0, 0.2, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
} as const;

export const semanticMotion = {
  feedback: {
    duration: primitiveMotion.duration.quick,
    easing: primitiveMotion.easing.standard,
    description: "Hover, press, toggle — immediate response",
  },
  orientation: {
    duration: primitiveMotion.duration.standard,
    easing: primitiveMotion.easing.enter,
    description: "Page transitions, panel slides, content reveals",
  },
  attention: {
    duration: primitiveMotion.duration.slow,
    easing: primitiveMotion.easing.bounce,
    description: "Status changes, deadline alerts, celebration moments",
  },
  none: {
    duration: primitiveMotion.duration.instant,
    easing: primitiveMotion.easing.linear,
    description: "Reduced motion fallback",
  },
} as const;

/**
 * Generate CSS transition string from motion tokens
 */
export function createTransition(
  properties: string | string[] = "all",
  duration: keyof typeof primitiveMotion.duration = "quick",
  easing: keyof typeof primitiveMotion.easing = "standard"
): string {
  const props = Array.isArray(properties) ? properties : [properties];
  const dur = primitiveMotion.duration[duration];
  const ease = primitiveMotion.easing[easing];
  return props.map((p) => `${p} ${dur}ms ${ease}`).join(", ");
}
