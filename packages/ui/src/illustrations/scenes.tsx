/**
 * Scene compositions: one per empty state, each an arrangement of kit parts.
 *
 * Hero and section draw the same landscape (the art box differs). Compact
 * keeps the prop and drops the landscape (spec §3), on a sky-tinted tile.
 */

import * as React from "react";
import {
  Bell,
  Building,
  Calendar,
  Clipboard,
  Coins,
  Cloud,
  Document,
  DoneMark,
  Drawer,
  Ground,
  INK,
  Palm,
  Package,
  PlusMark,
  Shield,
  Sun,
  Wrench,
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

/**
 * Storm damage, calm: clear sky, an intact building, and a report clipboard.
 * Never damage. No camera: the report form takes no photos, so the art must
 * not suggest it does.
 */
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
      <Clipboard x={236} y={112} />
    </Scene>
  );
}

const PROPS = { shield: Shield, coins: Coins, package: Package, wrench: Wrench, calendar: Calendar, bell: Bell, clipboard: Clipboard } as const;

/** Which prop a PropScene shows. */
export type SceneProp = keyof typeof PROPS;

/**
 * The general composition for a page without its own scene: the community's
 * building on a calm day, with the one prop that says what the page holds
 * (spec §5.3: a new screen is existing parts plus at most one prop). Compact
 * keeps the prop alone on the sky tile.
 */
export function PropScene({ size = "hero", className, prop }: SceneProps & { prop: SceneProp }) {
  const Prop = PROPS[prop];
  if (size === "compact") {
    return (
      <Scene size="compact" className={className}>
        <Tile />
        <Prop x={16} y={16} scale={0.53} />
      </Scene>
    );
  }
  return (
    <Scene size={size} className={className}>
      <Sun x={292} y={46} />
      <Cloud x={24} y={52} />
      <Ground y={214} />
      <Building x={40} y={214} columns={3} floors={2} />
      <Prop x={226} y={136} scale={1.2} />
    </Scene>
  );
}
