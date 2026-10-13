/**
 * The status the inbox opens on when the URL does not say otherwise.
 *
 * NOT 'all'. `StatusControl` describes `spam` as "a shelf" whose threads
 * "leave the default list", and with an 'all' default that was simply untrue —
 * shelving a thread changed a chip and nothing else, so an inbox whose entire
 * history had been triaged as spam still rendered as a wall of spam. Opening on
 * the work queue is what makes the shelf a shelf.
 *
 * Every writer of an inbox URL omits `?status=` exactly when it equals this
 * value, and every reader falls back to it — so they must all read this one
 * constant. `ThreadList` once spelled the default as 'all', and opening a
 * thread from the All tab produced a bare `/inbox/7` that reopened on Open:
 * the thread the operator had just clicked vanished from the list beside it.
 *
 * Its own module, not an export of `InboxDashboard`, for two reasons:
 * `InboxDashboard` renders `ThreadList`, so importing it back from there is a
 * cycle; and `InboxDashboard` is a `'use client'` module, which is the wrong
 * place for a server page to import a plain value from.
 */
export const INBOX_DEFAULT_STATUS = 'open';
