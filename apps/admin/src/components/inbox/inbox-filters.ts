/**
 * The status the inbox opens on when the URL does not say otherwise.
 *
 * NOT 'all'. `StatusControl` describes `spam` as "a shelf" whose threads
 * "leave the default list", and with an 'all' default that was simply untrue —
 * shelving a thread changed a chip and nothing else, so an inbox whose entire
 * history had been triaged as spam still rendered as a wall of spam. Opening on
 * the work queue is what makes the shelf a shelf.
 *
 * `InboxDashboard` falls back to this value when `?status=` is absent, so
 * every writer of an inbox URL — its own tab clicks and `ThreadList`'s row
 * links — must omit `?status=` exactly when it equals this value. `ThreadList`
 * once spelled the default as 'all', and opening a thread from the All tab
 * produced a bare `/inbox/7` that reopened on Open: the thread the operator had
 * just clicked vanished from the list beside it.
 *
 * Its own module, not an export of `InboxDashboard`, because `InboxDashboard`
 * renders `ThreadList`: importing the constant back from there is a cycle.
 */
export const INBOX_DEFAULT_STATUS = 'open';
