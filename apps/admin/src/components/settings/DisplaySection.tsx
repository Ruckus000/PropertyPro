'use client';

/**
 * Settings → Display: this browser's text size.
 *
 * Large text is the default across both apps (packages/ui/src/tokens/text-size.ts).
 * The choice is per browser, like apps/web's switch, not per operator: it lives
 * in localStorage, not in `platform_admin_preferences`, so it applies before
 * the page has fetched anything.
 */
import { Switch, useLargeText } from '@propertypro/ui';

export function DisplaySection() {
  const { largeText, setLargeText } = useLargeText();

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary">
        Display
      </h2>

      <div className="overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-content">Large text</p>
            <p className="mt-0.5 text-xs text-content-tertiary">
              On by default. Turn it off to fit more on screen. Saved for this browser only.
            </p>
          </div>
          <Switch
            aria-label="Large text"
            checked={largeText}
            onCheckedChange={setLargeText}
            className="shrink-0"
          />
        </div>
      </div>
    </section>
  );
}
