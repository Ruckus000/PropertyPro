'use client';

import { useEffect, useRef, useState } from 'react';
import type { TemplatePreviewDiagnostic } from '@/lib/templates/types';

export const VIEWPORT_PRESETS = {
  desktop: { label: 'Desktop', width: 1440 },
  tablet: { label: 'Tablet', width: 768 },
  phone: { label: 'Phone', width: 390 },
} as const;

export type ViewportPresetKey = keyof typeof VIEWPORT_PRESETS;

interface TemplatePreviewPaneProps {
  html: string | null;
  errors: TemplatePreviewDiagnostic[];
  isRefreshing: boolean;
  activePreset: ViewportPresetKey;
  templateName: string;
  compiledAt: string | null;
  onPresetChange: (value: ViewportPresetKey) => void;
}

function buildPreviewSrcDoc(html: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="/assets/tailwind.min.js" onerror="document.getElementById('tw-err').style.display='block'"></script>
    <style>
      html, body { margin: 0; padding: 0; background: white; }
      #tw-err { display: none; padding: 12px 16px; background: #fef3c7; color: #92400e; font: 13px/1.5 system-ui; border-bottom: 1px solid #fde68a; }
    </style>
  </head>
  <body>
    <div id="tw-err">Tailwind CSS failed to load. Styles may not render correctly.</div>
    ${html}
  </body>
</html>`;
}

export function TemplatePreviewPane({
  html,
  errors,
  isRefreshing,
  activePreset,
  templateName,
  compiledAt,
  onPresetChange,
}: TemplatePreviewPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerWidth(entry.contentRect.width);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const preset = VIEWPORT_PRESETS[activePreset];
  const scale = containerWidth > 0 ? Math.min(1, (containerWidth - 24) / preset.width) : 1;
  const frameHeight = 960;
  const previewHeight = Math.max(320, Math.round(frameHeight * scale));

  return (
    <section className="flex h-full min-h-[32rem] flex-col rounded-2xl border border-gray-200 bg-white shadow-sm" aria-label="Preview">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Preview</h3>
          <p className="text-xs text-gray-500">
            {compiledAt ? `Last compiled ${new Date(compiledAt).toLocaleTimeString()}` : 'Preview has not compiled yet'}
          </p>
        </div>
        <div
          className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 p-1"
          role="group"
          aria-label="Preview viewport"
        >
          {(Object.keys(VIEWPORT_PRESETS) as ViewportPresetKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onPresetChange(key)}
              aria-pressed={activePreset === key}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                activePreset === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900',
              ].join(' ')}
            >
              {VIEWPORT_PRESETS[key].label}
            </button>
          ))}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">
            {html ? 'Showing last successful preview' : 'Preview unavailable'}
          </p>
          <p className="mt-1">
            {errors[0]?.stage === 'runtime' ? 'Runtime error' : 'Compile error'}
            {': '}
            {errors[0]?.message}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            {html
              ? 'The last successful preview is still shown below while you resolve the latest issue.'
              : 'Fix the current issue to render the preview again.'}
          </p>
        </div>
      )}

      <div ref={containerRef} className="relative flex-1 overflow-auto bg-gray-100 p-3">
        {isRefreshing && (
          <div className="absolute right-6 top-6 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
            Refreshing preview…
          </div>
        )}

        {!html ? (
          <div className="flex h-full min-h-[24rem] items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white px-6 text-center">
            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-gray-900">Preview unavailable</h4>
              <p className="max-w-md text-sm leading-6 text-gray-500">
                Fix the current issue to render the preview again.
              </p>
            </div>
          </div>
        ) : (
          <div style={{ height: `${previewHeight}px` }}>
            <iframe
              title={`Preview: ${templateName} (${preset.label})`}
              sandbox="allow-scripts"
              srcDoc={buildPreviewSrcDoc(html)}
              className="origin-top-left rounded-2xl border border-gray-200 bg-white shadow-sm"
              style={{
                width: `${preset.width}px`,
                height: `${frameHeight}px`,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
