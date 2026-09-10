/**
 * Web wrapper for @propertypro/ui's props-only EmptyState.
 *
 * packages/ui's EmptyState only knows about concrete props (icon component,
 * title, description, action, size). This wrapper keeps the two web-only
 * ways call sites already use it — a curated `preset` key
 * (EMPTY_STATE_CONFIGS) or a string `icon` key (ICON_MAP) — resolves either
 * to a concrete icon/title/description, and delegates rendering.
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

interface EmptyStateBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

interface EmptyStateCustomProps extends EmptyStateBaseProps {
  /** Icon component or icon key */
  icon?: LucideIcon | EmptyStateIconKey;
  /** Primary message (encouraging, action-oriented) */
  title: string;
  /** Additional context */
  description?: string;
  /** Optional action (usually a button) */
  action?: React.ReactNode;
}

interface EmptyStatePresetProps extends EmptyStateBaseProps {
  /** Use a preset from EMPTY_STATE_CONFIGS */
  preset: EmptyStateKey;
  /** Optional action override (required if preset has actionLabel) */
  action?: React.ReactNode;
}

export type EmptyStateProps = EmptyStateCustomProps | EmptyStatePresetProps;

function isPreset(props: EmptyStateProps): props is EmptyStatePresetProps {
  return "preset" in props;
}

// ── Component ──

export function EmptyState(props: EmptyStateProps) {
  const { size = "md", action, className, ...rest } = props;

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
  // union was passed, none of which UiEmptyState (or the DOM div it spreads
  // onto) should receive.
  const divProps = { ...rest } as Record<string, unknown>;
  delete divProps.preset;
  delete divProps.title;
  delete divProps.description;
  delete divProps.icon;

  return (
    <UiEmptyState
      icon={IconComponent}
      title={title}
      description={description}
      action={action}
      size={size}
      className={className}
      {...(divProps as React.HTMLAttributes<HTMLDivElement>)}
    />
  );
}
