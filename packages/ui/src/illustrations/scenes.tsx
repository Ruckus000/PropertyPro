/**
 * Scene compositions: one per empty state, each an arrangement of kit parts.
 *
 * Hero and section draw the same landscape (the art box differs). Compact
 * keeps the prop and drops the landscape (spec §3), on a sky-tinted tile.
 */

import * as React from "react";
import {
  Building,
  Camera,
  Clipboard,
  Cloud,
  Document,
  DoneMark,
  Drawer,
  Ground,
  INK,
  Palm,
  PlusMark,
  Sun,
} from "./parts";
import { Scene, type SceneProps } from "./scene";

/** The compact vignette's tile: the illustration panel colour, radius matching an icon tile. */
function Tile() {
  return <rect x={2} y={2} width={60} height={60} rx={12} fill={INK.sky} />;
}

/**
 * Documents: a filing drawer waiting for its records, the next one marked to add.
 * `next={false}` drops the "next to add" mark, for a viewer who cannot add
 * anything (a resident's waiting state).
 */
export function DocumentsScene({ size = "hero", className, next = true }: SceneProps & { next?: boolean }) {
  if (size === "compact") {
    return (
      <Scene size="compact" className={className}>
        <Tile />
        <Drawer x={14} y={52} scale={0.3} />
        <Document x={34} y={12} scale={0.32} />
      </Scene>
    );
  }
  return (
    <Scene size={size} className={className}>
      <Sun x={276} y={52} />
      <Cloud x={24} y={58} />
      <Ground y={214} />
      <Building x={28} y={214} columns={2} floors={2} />
      <Drawer x={150} y={214} />
      <g transform="rotate(-10 250 120)">
        <Document x={226} y={86} />
      </g>
      {next && <PlusMark x={262} y={196} />}
    </Scene>
  );
}

/** Directory: a building whose units aren't set up yet; one window marked as the next to add. */
export function DirectoryScene({ size = "hero", className }: SceneProps) {
  if (size === "compact") {
    return (
      <Scene size="compact" className={className}>
        <Tile />
        <Building x={14} y={54} columns={2} floors={1} emptyWindows nextWindow={0} scale={0.36} />
      </Scene>
    );
  }
  return (
    <Scene size={size} className={className}>
      <Sun x={302} y={44} />
      <Cloud x={20} y={52} />
      <Ground y={214} />
      <Building x={70} y={214} columns={4} floors={3} emptyWindows nextWindow={0} />
      <Palm x={314} y={214} />
    </Scene>
  );
}

/** Storm damage, calm: clear sky, an intact building, and the report kit ready. Never damage. */
export function StormCalmScene({ size = "hero", className }: SceneProps) {
  if (size === "compact") {
    return (
      <Scene size="compact" className={className}>
        <Tile />
        <Clipboard x={14} y={10} scale={0.42} />
        <DoneMark x={44} y={42} scale={0.6} />
      </Scene>
    );
  }
  return (
    <Scene size={size} className={className}>
      <Sun x={60} y={50} />
      <Cloud x={238} y={48} />
      <Ground y={214} />
      <Building x={20} y={214} columns={2} floors={2} />
      <Palm x={180} y={214} />
      <Clipboard x={216} y={110} />
      <Camera x={246} y={164} />
    </Scene>
  );
}
