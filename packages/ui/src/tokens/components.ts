/**
 * Component-level tokens — specific dimensions and behavior contracts
 */

import { primitiveSpace } from "./spacing";
import { primitiveRadius } from "./radius";

export const componentTokens = {
  button: {
    height: {
      sm: 36,
      md: 40,
      lg: 48,
    },
    padding: {
      sm: primitiveSpace[3],
      md: primitiveSpace[4],
      lg: primitiveSpace[5],
    },
    iconSize: {
      sm: 14,
      md: 16,
      lg: 18,
    },
    gap: primitiveSpace[2],
    radius: primitiveRadius.md,
  },
  badge: {
    height: {
      sm: 20,
      md: 24,
      lg: 28,
    },
    padding: {
      sm: primitiveSpace[2],
      md: primitiveSpace[3],
      lg: primitiveSpace[3],
    },
    iconSize: {
      sm: 12,
      md: 14,
      lg: 16,
    },
    gap: primitiveSpace[1],
    radius: primitiveRadius.full,
  },
  input: {
    height: {
      sm: 36,
      md: 40,
      lg: 48,
    },
    padding: {
      sm: primitiveSpace[2],
      md: primitiveSpace[3],
      lg: primitiveSpace[4],
    },
    radius: primitiveRadius.sm,
    borderWidth: 1,
    focusBorderWidth: 2,
  },
  card: {
    padding: {
      sm: primitiveSpace[4],
      md: primitiveSpace[5],
      lg: primitiveSpace[6],
    },
    radius: primitiveRadius.md,
    gap: primitiveSpace[4],
    elevation: {
      rest: "e0" as const,
      hover: "e1" as const,
      interactive: "e1" as const,
    },
  },
  nav: {
    rail: {
      widthCollapsed: 64,
      widthExpanded: 240,
    },
    item: {
      height: 44,
      padding: primitiveSpace[3],
      radius: primitiveRadius.md,
      iconSize: 20,
      gap: primitiveSpace[3],
    },
  },
  table: {
    row: {
      height: 52,
      padding: primitiveSpace[4],
    },
    header: {
      height: 40,
      padding: primitiveSpace[4],
    },
    cell: {
      padding: primitiveSpace[3],
    },
  },
  modal: {
    width: {
      sm: 400,
      md: 560,
      lg: 720,
      xl: 960,
    },
    padding: primitiveSpace[6],
    radius: primitiveRadius.lg,
    elevation: "e3" as const,
  },
  tooltip: {
    padding: `${primitiveSpace[2]}px ${primitiveSpace[3]}px`,
    radius: primitiveRadius.md,
    maxWidth: 280,
  },
} as const;

export type ComponentTokens = typeof componentTokens;
