/**
 * EmptyState — Placeholder for empty content areas.
 *
 * Tailwind-based implementation of the pattern from
 * docs/design-system/patterns/EmptyState.tsx.
 *
 * Can be used with presets from EMPTY_STATE_CONFIGS or with custom props.
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
import { cn } from "@/lib/utils";
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

// ── Size config ──

const sizeConfig = {
  sm: {
    container: "py-6 px-4",
    iconContainer: "h-14 w-14",
    iconSize: 24,
    title: "text-base font-semibold",
    description: "text-sm max-w-[280px]",
  },
  md: {
    container: "py-10 px-6",
    iconContainer: "h-[72px] w-[72px]",
    iconSize: 28,
    title: "text-lg font-semibold",
    description: "text-sm max-w-[320px]",
  },
  lg: {
    container: "py-12 px-8",
    iconContainer: "h-[88px] w-[88px]",
    iconSize: 36,
    title: "text-xl font-semibold",
    description: "text-base max-w-[360px]",
  },
} as const;

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

type EmptyStateProps = EmptyStateCustomProps | EmptyStatePresetProps;

function isPreset(props: EmptyStateProps): props is EmptyStatePresetProps {
  return "preset" in props;
}

// ── Component ──

export function EmptyState(props: EmptyStateProps) {
  const {
    size = "md",
    action,
    className,
    ...rest
  } = props;

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

  const s = sizeConfig[size];

  // Clean up extra props before spreading
  const divProps = { ...rest } as Record<string, unknown>;
  delete divProps.preset;
  delete divProps.title;
  delete divProps.description;
  delete divProps.icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        s.container,
        className
      )}
      {...(divProps as React.HTMLAttributes<HTMLDivElement>)}
    >
      {IconComponent && (
        <div
          className={cn(
            "mb-4 flex items-center justify-center rounded-full bg-surface-muted",
            s.iconContainer
          )}
        >
          <IconComponent
            size={s.iconSize}
            className="text-content-tertiary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <h3 className={cn("text-content", s.title)}>{title}</h3>
        {description && (
          <p className={cn("text-content-tertiary", s.description)}>
            {description}
          </p>
        )}
      </div>

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
