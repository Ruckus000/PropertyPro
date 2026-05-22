'use client';

/**
 * <PageHeaderHelpButton/> — labeled Help button rendered in every
 * PageHeader's actions row (and as a fallback in the AppShell content
 * area for pages that don't use PageHeader). Lives here because the
 * top-bar utility icon was getting lost among notifications, search,
 * and community switcher icons.
 *
 * Gated on NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED. When the flag is OFF
 * we render NOTHING — preserving the pre-Phase-A baseline (the legacy
 * top-bar CircleHelp + drawer is the only help surface, exactly as
 * before this PR shipped). The button only appears when the new modal
 * is also live; both ride the same flag so users never see a labeled
 * button that opens an inconsistent legacy drawer.
 *
 * Renders `null` if no HelpWidgetProvider is mounted, so PageHeader
 * remains safe to use outside the authenticated AppShell.
 */
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHelpWidgetOptional } from '@/components/help/help-widget-provider';

const HELP_DOCS_MODAL_ENABLED =
  process.env.NEXT_PUBLIC_HELP_DOCS_MODAL_ENABLED === 'true';

export function PageHeaderHelpButton() {
  const widget = useHelpWidgetOptional();
  if (!widget) return null;
  if (!HELP_DOCS_MODAL_ENABLED) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={widget.toggle}
      aria-label="Open help for this page"
      title="Open help for this page (?)"
      // Touch target: ghost+sm is 32px tall, below the 44px mobile rule.
      // Promote to 44px via `min-h` on smaller viewports; keep the compact
      // 32px treatment from sm-and-up where pointer precision is finer.
      className="min-h-11 text-content-secondary hover:bg-transparent hover:text-interactive sm:min-h-0"
    >
      <HelpCircle aria-hidden="true" />
      Help
    </Button>
  );
}
