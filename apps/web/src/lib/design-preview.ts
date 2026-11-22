import { cookies } from 'next/headers';

export const DESIGN_PREVIEW_COOKIE = 'pp_design_preview';

// ponytail: an env allow-list, so the owner cannot flip between old and new on one
// account (compare with a second account or a second browser profile). Trigger: the
// owner asks to flip back, or anyone other than the owner needs the preview.
/**
 * True when the user is on the allow-list, or, outside a production build, when
 * the cookie is "1". Never throws. Env is read at call time, not module load.
 *
 * Selects which view to render only. Never use it as an authorization check:
 * callers must still gate on role (for example `preview && isStaff`).
 */
export async function isDesignPreviewOn(userId: string): Promise<boolean> {
  try {
    const allowed = (process.env.DESIGN_PREVIEW_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (userId && allowed.includes(userId)) return true;

    if (process.env.NODE_ENV !== 'production') {
      const jar = await cookies();
      return jar.get(DESIGN_PREVIEW_COOKIE)?.value === '1';
    }
    return false;
  } catch {
    return false;
  }
}
