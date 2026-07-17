import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ProBadge — small gold chip marking a Professional-tier / premium feature.
 *
 * Uses the `status-premium` semantic token (the "Florida Modern" gold accent).
 * The word itself ("Pro") carries the meaning, so it's readable without relying
 * on color; the Sparkles glyph is decorative (aria-hidden).
 */
export function ProBadge({
  label = "Pro",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-status-premium-subtle px-1.5 py-0.5 text-xs font-medium text-status-premium",
        className,
      )}
    >
      <Sparkles size={11} aria-hidden="true" />
      {label}
    </span>
  );
}
