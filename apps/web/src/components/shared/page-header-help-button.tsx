'use client';

/**
 * <PageHeaderHelpButton/> — labeled Help button rendered in every
 * PageHeader's actions row. The dedicated per-page surface lives here
 * (not in AppTopBar's utility row) because user research surfaced that
 * the small top-bar icon was getting lost among notifications, search,
 * and community switcher icons.
 *
 * Behaviour matches the top-bar icon — both call useHelpWidget().toggle(),
 * so the same modal (new) or drawer (old, behind flag) opens. Renders
 * `null` if no HelpWidgetProvider is mounted in the tree, so PageHeader
 * stays safe to use outside the authenticated AppShell.
 */
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHelpWidgetOptional } from '@/components/help/help-widget-provider';

export function PageHeaderHelpButton() {
  const widget = useHelpWidgetOptional();
  if (!widget) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={widget.toggle}
      aria-label="Open help for this page"
      title="Open help for this page (?)"
      className="text-content-secondary hover:text-interactive hover:bg-transparent"
    >
      <HelpCircle aria-hidden="true" />
      Help
    </Button>
  );
}
