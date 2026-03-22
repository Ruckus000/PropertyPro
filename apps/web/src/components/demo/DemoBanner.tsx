'use client';

/**
 * DemoBanner — Floating banner shown at the bottom of the screen during demo sessions.
 *
 * Displays the current demo role (Board Member / Resident), a button to switch
 * to the other role, and a link to exit the demo back to the landing page.
 *
 * The switch button POSTs to `/api/v1/demo/[slug]/enter` with the opposite role,
 * mirroring the landing page form behavior.
 */

interface DemoBannerProps {
  /** Whether the current session is a demo. When false, nothing renders. */
  isDemoMode: boolean;
  /** The active demo role — derived from user email pattern. */
  currentRole: 'board' | 'resident';
  /** Demo instance slug — used for the switch/exit URLs. */
  slug: string;
}

const ROLE_LABELS: Record<'board' | 'resident', string> = {
  board: 'Board Member',
  resident: 'Resident',
};

export function DemoBanner({ isDemoMode, currentRole, slug }: DemoBannerProps) {
  if (!isDemoMode) return null;

  const oppositeRole = currentRole === 'board' ? 'resident' : 'board';
  const enterPath = `/api/v1/demo/${slug}/enter`;
  const exitPath = `/demo/${slug}`;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex h-10 items-center justify-center gap-4 bg-gray-900/90 px-4 text-sm text-white backdrop-blur-sm"
      role="status"
      aria-label="Demo session banner"
    >
      <span className="opacity-80">
        Viewing as <strong className="font-semibold">{ROLE_LABELS[currentRole]}</strong>
      </span>

      <form action={enterPath} method="POST" className="inline">
        <input type="hidden" name="role" value={oppositeRole} />
        <button
          type="submit"
          className="rounded border border-white/40 px-2.5 py-0.5 text-xs font-medium text-white transition-colors hover:border-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          Switch to {ROLE_LABELS[oppositeRole]}
        </button>
      </form>

      <a
        href={exitPath}
        className="text-xs text-white/60 underline underline-offset-2 transition-colors hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      >
        Exit Demo
      </a>
    </div>
  );
}
