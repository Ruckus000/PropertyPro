/**
 * The Help drawer's element id, for its openers' `aria-controls`.
 *
 * A module of its own because the top bar's Help button needs it on the first
 * paint while the drawer itself is code-split: importing it from
 * `HelpDrawer.tsx` would pull the drawer into the editor's first load.
 */
export const HELP_DRAWER_ID = 'site-editor-help';
