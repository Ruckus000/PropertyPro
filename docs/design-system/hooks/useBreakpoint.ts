import { useEffect, useMemo, useState } from "react";

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export function useBreakpoint() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : breakpoints.lg
  );

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return useMemo(() => {
    const breakpoint =
      (Object.entries(breakpoints) as Array<[keyof typeof breakpoints, number]>)
        .slice()
        .reverse()
        .find(([, value]) => width >= value)?.[0] ?? "xs";

    return {
      width,
      isMobile: width < breakpoints.sm,
      isTablet: width >= breakpoints.sm && width < breakpoints.lg,
      isDesktop: width >= breakpoints.lg,
      breakpoint,
    };
  }, [width]);
}

