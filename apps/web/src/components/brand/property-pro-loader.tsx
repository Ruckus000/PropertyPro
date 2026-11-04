/**
 * Animated PropertyPro loader: the house mark from `property-pro-mark.tsx`
 * drawing itself on a loop, a label, and a thin indeterminate progress track.
 *
 * The paths are the same as `PropertyProMark`; if the mark changes, change
 * them here too. `pathLength="1"` lets the CSS draw each stroke with a dash of
 * length 1 whatever its real length.
 *
 * `fullScreen` covers the viewport (used after sign-in while the dashboard
 * loads). Without it the loader just centres in its container.
 */
import './property-pro-loader.css';

interface PropertyProLoaderProps {
  label: string;
  detail?: string;
  fullScreen?: boolean;
}

function AnimatedMark() {
  return (
    <svg
      className="pp-loader-mark size-16 text-interactive"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="pp-loader-stroke pp-loader-roof"
        pathLength={1}
        d="M4 11.8L16 4.4l12 7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="pp-loader-stroke pp-loader-walls"
        pathLength={1}
        d="M6.6 14.9V25.6a2.6 2.6 0 0 0 2.6 2.6h13.6a2.6 2.6 0 0 0 2.6-2.6V14.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect
        className="pp-loader-bar pp-loader-bar-long"
        x="10"
        y="18.5"
        width="12"
        height="2.3"
        rx="1.15"
        fill="currentColor"
      />
      <rect
        className="pp-loader-bar pp-loader-bar-short opacity-60"
        x="10"
        y="23.1"
        width="6"
        height="2.3"
        rx="1.15"
        fill="currentColor"
      />
    </svg>
  );
}

export function PropertyProLoader({ label, detail, fullScreen = false }: PropertyProLoaderProps) {
  const body = (
    <div role="status" aria-live="polite" className="flex flex-col items-center text-center">
      <div className="flex size-24 items-center justify-center rounded-lg border border-edge bg-surface-card">
        <AnimatedMark />
      </div>
      <p className="mt-6 text-balance font-display text-2xl font-semibold tracking-tight text-content">
        {label}
      </p>
      {detail ? <p className="mt-2 text-sm text-content-secondary">{detail}</p> : null}
      <div
        aria-hidden="true"
        className="pp-loader-track mt-6 h-1 w-40 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="pp-loader-track-fill h-full w-2/5 rounded-full bg-interactive" />
      </div>
    </div>
  );

  if (!fullScreen) {
    return <div className="flex min-h-64 items-center justify-center p-8">{body}</div>;
  }

  return (
    <div className="pp-loader-overlay fixed inset-0 z-50 flex items-center justify-center bg-surface-page px-4">
      {body}
    </div>
  );
}
