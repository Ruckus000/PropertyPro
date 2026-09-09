/**
 * Shadows `app/loading.tsx` for everything under `/auth` (Next resolves the
 * nearest `loading.tsx` above a segment). Without this, the console-shaped
 * skeleton in the root fallback would flash a rail and a top bar on the
 * login screen — which is neither, and sits outside the `(console)` group
 * entirely. Neutral and login-appropriate instead: matches
 * `auth/login/page.tsx`'s own centred, dark background with no rail and no
 * top bar. Server component, no data access.
 */
export default function AuthLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="flex min-h-screen items-center justify-center bg-surface-inverse-subtle px-4"
    >
      <div className="size-8 animate-pulse rounded-full bg-surface-inverse" />
    </div>
  );
}
