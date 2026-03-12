'use client';

import { useLargeText } from '@/hooks/useLargeText';

export function AccessibilitySettings() {
  const { largeText, setLargeText } = useLargeText();

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Accessibility</h2>
      <p className="mt-1 text-base text-gray-600">
        Adjust display settings for better readability.
      </p>
      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-base font-medium text-gray-900">Large Text</p>
          <p className="text-sm text-gray-600">
            Increases font sizes throughout the application for easier reading.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={largeText}
          onClick={() => setLargeText(!largeText)}
          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 ${
            largeText ? 'bg-[var(--interactive-primary)]' : 'bg-gray-200'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              largeText ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </section>
  );
}
