'use client';

import { useLargeText } from '@/hooks/useLargeText';

export function AccessibilitySettings() {
  const { largeText, setLargeText } = useLargeText();

  return (
    <section className="rounded-md border border-edge bg-surface-card p-5">
      <h2 className="text-lg font-semibold text-content">Accessibility</h2>
      <p className="mt-1 text-base text-content-secondary">
        Adjust display settings for better readability.
      </p>
      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-base font-medium text-content">Large Text</p>
          <p className="text-sm text-content-secondary">
            Increases font sizes throughout the application for easier reading.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={largeText}
          aria-label="Toggle large text"
          onClick={() => setLargeText(!largeText)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-quick ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 ${
            largeText ? 'bg-[var(--interactive-primary)]' : 'bg-surface-muted'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-surface-card shadow ring-0 transition duration-quick ease-in-out ${
              largeText ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
