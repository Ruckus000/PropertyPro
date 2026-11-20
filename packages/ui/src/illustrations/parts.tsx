/**
 * The illustration kit: one component per part, composed into scenes.
 *
 * Spec: docs/design-system/patterns/empty-states.md §5. Rules every part keeps:
 * - Paint only with palette custom properties, as SVG attributes. No hex
 *   (guard:design-tokens checks this folder) and no Tailwind fill classes,
 *   which could silently emit no CSS.
 * - Flat fills, round caps and joins, no gradients, shadows or textures.
 * - Calm: intact buildings, clear skies. Never damage, people or emoji.
 * - Each part draws at its own origin; `x`/`y` place it in the scene.
 *
 * A new screen composes these plus at most one new prop (spec §5.3).
 */

import * as React from "react";

/** The palette roles of spec §5.2, single-sourced so a part can't drift to a nearby token. */
export const INK = {
  card: "var(--sand-0)",
  muted: "var(--sand-100)",
  line2: "var(--sand-300)",
  coral: "var(--coral-600)",
  sky: "var(--teal-50)",
  teal: "var(--teal-200)",
  tealInk: "var(--teal-700)",
  sun: "var(--amber-200)",
  amberInk: "var(--amber-700)",
  green: "var(--green-700)",
} as const;

export interface PartProps {
  x?: number;
  y?: number;
  /** Uniform scale about the part's origin. */
  scale?: number;
}

function place({ x = 0, y = 0, scale = 1 }: PartProps): string {
  return scale === 1 ? `translate(${x} ${y})` : `translate(${x} ${y}) scale(${scale})`;
}

const ROUND = { strokeLinecap: "round", strokeLinejoin: "round" } as const;

// ── Landscape ──

/** Sun, radius 30. Origin at its centre. */
export function Sun(props: PartProps) {
  return <circle transform={place(props)} r={30} fill={INK.sun} />;
}

/** Cloud, about 70 × 26. Origin at its bottom-left. */
export function Cloud(props: PartProps) {
  return (
    <path
      transform={place(props)}
      d="M0 0c0-12 10-20 22-19 5-10 20-13 28-5 12-1 20 7 18 24z"
      fill={INK.card}
    />
  );
}

/** Palm, about 46 wide × 72 tall. Origin at the foot of the trunk. */
export function Palm(props: PartProps) {
  return (
    <g transform={place(props)} fill="none" strokeWidth={3} {...ROUND}>
      <path d="M0 0c-3-28-8-48-18-64" stroke={INK.amberInk} />
      <path
        d="M-18-64c14-7 30-3 36 7M-18-64c0-14-9-24-23-26M-18-64c-14-6-28-1-33 9"
        stroke={INK.green}
      />
    </g>
  );
}

/** Ground band, the full scene width. Origin at its top-left. */
export function Ground(props: PartProps) {
  return <rect transform={place(props)} width={340} height={16} fill={INK.teal} />;
}

export interface BuildingProps extends PartProps {
  /** Window columns (default 4). */
  columns?: number;
  /** Floors, 1–3 (default 2). The ground floor holds the door. */
  floors?: 1 | 2 | 3;
  /**
   * Draw windows as empty dashed outlines, for a building whose units are not
   * set up yet. The index in `nextWindow` gets the coral "next to add" mark
   * instead (unlabelled: spec L-1, no unit numbers in art).
   */
  emptyWindows?: boolean;
  nextWindow?: number;
}

/**
 * Low-rise building with a flat teal roof, a window grid and a door. Origin
 * at its bottom-left, so it stands on whatever `y` the ground band starts at.
 */
export function Building({
  columns = 4,
  floors = 2,
  emptyWindows = false,
  nextWindow,
  ...props
}: BuildingProps) {
  const width = columns * 44 + 16;
  const height = floors * 42 + 34;
  const doorColumn = Math.floor((columns - 1) / 2);
  const windows: Array<{ x: number; y: number; index: number }> = [];
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (floor === floors - 1 && column === doorColumn) continue;
      windows.push({ x: 18 + column * 44, y: -height + 22 + floor * 42, index: windows.length });
    }
  }
  return (
    <g transform={place(props)}>
      <rect x={0} y={-height} width={width} height={height} rx={6} fill={INK.card} stroke={INK.teal} strokeWidth={3} />
      <rect x={-8} y={-height - 10} width={width + 16} height={14} rx={4} fill={INK.tealInk} />
      {windows.map((w) =>
        w.index === nextWindow ? (
          <PlusMark key={w.index} x={w.x + 15} y={w.y + 13} scale={0.8} />
        ) : (
          <rect
            key={w.index}
            x={w.x}
            y={w.y}
            width={30}
            height={26}
            rx={3}
            fill={emptyWindows ? INK.muted : INK.sky}
            stroke={emptyWindows ? INK.line2 : INK.teal}
            strokeWidth={2}
            strokeDasharray={emptyWindows ? "5 4" : undefined}
          />
        ),
      )}
      <rect x={18 + doorColumn * 44} y={-44} width={30} height={44} rx={3} fill={INK.teal} />
    </g>
  );
}

// ── Props ──

/** Filing drawer with two folders standing in it, about 120 × 104. Origin at its bottom-left. */
export function Drawer(props: PartProps) {
  return (
    <g transform={place(props)} strokeWidth={3} {...ROUND}>
      <rect x={14} y={-118} width={26} height={44} rx={4} fill={INK.teal} />
      <rect x={44} y={-126} width={26} height={52} rx={4} fill={INK.sun} />
      <rect x={0} y={-90} width={120} height={90} rx={10} fill={INK.card} stroke={INK.line2} />
      <rect x={10} y={-76} width={100} height={30} rx={6} fill={INK.muted} stroke={INK.line2} />
      <rect x={10} y={-38} width={100} height={30} rx={6} fill={INK.card} stroke={INK.line2} />
      <path d="M50-61h20M50-23h20" stroke={INK.line2} strokeWidth={3} />
    </g>
  );
}

/** A single coral document, 52 × 66. Origin at its top-left. */
export function Document(props: PartProps) {
  return (
    <g transform={place(props)} {...ROUND}>
      <rect width={52} height={66} rx={5} fill={INK.coral} />
      <path d="M11 18h30M11 30h22M11 42h28" stroke={INK.card} strokeWidth={3} fill="none" />
    </g>
  );
}

/** Clipboard holding a short form, 64 × 80. Origin at its top-left. */
export function Clipboard(props: PartProps) {
  return (
    <g transform={place(props)} {...ROUND}>
      <rect y={8} width={64} height={80} rx={7} fill={INK.card} stroke={INK.tealInk} strokeWidth={3} />
      <rect x={20} width={24} height={14} rx={4} fill={INK.tealInk} />
      <path d="M14 34h36M14 50h28M14 66h32" stroke={INK.line2} strokeWidth={3} fill="none" />
    </g>
  );
}

/** Camera, 72 × 52. Origin at its top-left. */
export function Camera(props: PartProps) {
  return (
    <g transform={place(props)} strokeWidth={3} {...ROUND}>
      <path d="M2 14h16l6-12h24l6 12h16v36H2z" fill={INK.sun} stroke={INK.amberInk} />
      <circle cx={36} cy={32} r={11} fill={INK.card} stroke={INK.amberInk} />
    </g>
  );
}

// ── Marks ──

/** "Next to add": coral disc with a light plus, radius 14. Origin at its centre. */
export function PlusMark(props: PartProps) {
  return (
    <g transform={place(props)}>
      <circle r={14} fill={INK.coral} stroke={INK.card} strokeWidth={3} />
      <path d="M0-7v14M-7 0h14" stroke={INK.card} strokeWidth={3} strokeLinecap="round" />
    </g>
  );
}

/** "Done": green disc with a light check, radius 14. Origin at its centre. */
export function DoneMark(props: PartProps) {
  return (
    <g transform={place(props)}>
      <circle r={14} fill={INK.green} />
      <path d="M-7 0l5 5 9-10" stroke={INK.card} strokeWidth={3} fill="none" {...ROUND} />
    </g>
  );
}
