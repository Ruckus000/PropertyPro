/**
 * Drop everything the service worker has stored on this device.
 *
 * ## Why sign-out has to do this
 *
 * The worker's navigation cache holds authenticated console DOCUMENTS — the
 * notification tray's correspondent names, a client's billing, whatever page
 * the operator last opened. CacheStorage is not a cookie: clearing the Supabase
 * session leaves every one of those entries on disk, and an offline navigation
 * serves them with no session, no middleware check and no `platform_admin_users`
 * lookup. Sign-out is the one moment the operator has told us this device should
 * stop holding their session's data, so it is the moment to act on.
 *
 * Every cache is deleted, not just the current version: a rolled-back worker
 * leaves an older cache name behind, and "the one we happen to name today" is
 * not the set the operator meant. That includes the precached `/offline` page —
 * which the worker re-adds on its next install, and which `handleNavigation`
 * already has an inline fallback for in the meantime.
 *
 * ## Best effort, and never a reason not to sign out
 *
 * `caches` is absent on a non-secure origin and throws outright in some
 * storage-disabled contexts. Every failure is swallowed: the session has
 * already been cleared by the time this runs, and refusing to navigate because
 * a cache delete failed would leave the operator staring at a console they are
 * no longer signed in to.
 */
export async function clearOfflineCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch {
    // Best effort — see the docblock.
  }
}
