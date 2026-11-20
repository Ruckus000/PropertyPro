/**
 * Web wrapper for @propertypro/ui's props-only EmptyState.
 *
 * packages/ui's EmptyState only knows about concrete props. This wrapper keeps
 * the two web-only ways call sites already use it — a curated `preset` key
 * (EMPTY_STATE_CONFIGS) or a string `icon` key (ICON_MAP) — resolves either to
 * a concrete icon/title/description, and delegates rendering.
 *
 * Scene sizes (`hero` / `section` / `compact`) take an `illustration` instead
 * of an icon; a preset's icon is ignored there. See
 * docs/design-system/patterns/empty-states.md.
 */

import * as React from "react";
import {
  Upload,
  Users,
  Bell,
  Wrench,
  AlertCircle,
  WifiOff,
  CheckCircle2,
  Calendar,
  FileText,
  Building2,
  ShieldCheck,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import { EmptyState as UiEmptyState } from "@propertypro/ui";
import {
  type EmptyStateKey,
  type EmptyStateIconKey,
  getEmptyStateConfig,
} from "@/lib/constants/empty-states";

// ── Icon mapping ──

const ICON_MAP: Record<EmptyStateIconKey, LucideIcon> = {
  upload: Upload,
  users: Users,
  bell: Bell,
  wrench: Wrench,
  alert: AlertCircle,
  "wifi-off": WifiOff,
  check: CheckCircle2,
  calendar: Calendar,
  "file-text": FileText,
  building: Building2,
  "shield-check": ShieldCheck,
  inbox: Inbox,
};

// ── Props ──

type IconSize = "sm" | "md" | "lg";
type SceneSize = "hero" | "section" | "compact";

/** The older icon look. A scene prop here is a type error, not silently dropped. */
interface IconVariant {
  size?: IconSize;
  /** Icon component or icon key */
  icon?: LucideIcon | EmptyStateIconKey;
  illustration?: never;
  eyebrow?: never;
  aside?: never;
}

/** The empty-state pattern (docs/design-system/patterns/empty-states.md). */
interface SceneVariant {
  size: SceneSize;
  /** The illustration, e.g. `<DocumentsScene size="hero" />`. */
  illustration?: React.ReactNode;
  /** Hero only: what the page is. */
  eyebrow?: string;
  /** Hero only: the context column. */
  aside?: React.ReactNode;
  icon?: never;
}

interface CustomContent {
  /** Primary message (encouraging, action-oriented) */
  title: string;
  /** Additional context */
  description?: string;
  /** Optional action (usually a button) */
  action?: React.ReactNode;
}

interface PresetContent {
  /** Use a preset from EMPTY_STATE_CONFIGS (its icon applies to sm/md/lg only) */
  preset: EmptyStateKey;
  /** Optional action override (required if preset has actionLabel) */
  action?: React.ReactNode;
  icon?: never;
}

type ElementProps = Omit<React.HTMLAttributes<HTMLElement>, "title">;

export type EmptyStateProps = ElementProps &
  (IconVariant | SceneVariant) &
  (CustomContent | PresetContent);

function isPreset(props: EmptyStateProps): props is EmptyStateProps & PresetContent {
  return "preset" in props;
}

function isSceneSize(size: IconSize | SceneSize): size is SceneSize {
  return size === "hero" || size === "section" || size === "compact";
}

// ── Component ──

export function EmptyState(props: EmptyStateProps) {
  const { size = "md", action, illustration, eyebrow, aside, className, ...rest } = props;

  let title: string;
  let description: string | undefined;
  let IconComponent: LucideIcon | undefined;

  if (isPreset(props)) {
    const config = getEmptyStateConfig(props.preset);
    title = config.title;
    description = config.description;
    IconComponent = ICON_MAP[config.icon];
  } else {
    title = props.title;
    description = props.description;
    if (typeof props.icon === "string") {
      IconComponent = ICON_MAP[props.icon];
    } else {
      IconComponent = props.icon;
    }
  }

  // Clean up extra props before spreading — `rest` may still carry
  // `preset`/`title`/`description`/`icon` depending on which branch of the
  // union was passed, none of which UiEmptyState (or the DOM element it
  // spreads onto) should receive.
  const domProps = { ...rest } as Record<string, unknown>;
  delete domProps.preset;
  delete domProps.title;
  delete domProps.description;
  delete domProps.icon;
  const elementProps = domProps as Omit<React.HTMLAttributes<HTMLElement>, "title">;

  if (isSceneSize(size)) {
    return (
      <UiEmptyState
        size={size}
        illustration={illustration}
        eyebrow={eyebrow}
        aside={aside}
        title={title}
        description={description}
        action={action}
        className={className}
        {...elementProps}
      />
    );
  }

  return (
    <UiEmptyState
      icon={IconComponent}
      title={title}
      description={description}
      action={action}
      size={size}
      className={className}
      {...elementProps}
    />
  );
}
