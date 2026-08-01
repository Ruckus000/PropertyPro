'use client';

/**
 * The "Pages" tool panel — which page of the site the editor is editing, and
 * every change a PM can make to the set of pages (website editor v3, Phase
 * 11b-3, slices S4a + S4b).
 *
 * ## States (all four, per `.claude/rules/design.md`)
 *
 *   loading → the list is in flight: skeleton rows
 *   error   → the read failed: danger banner + retry
 *   empty   → the community has no pages at all
 *   success → the pages, home pinned first, in nav order
 *
 * The empty state is genuinely reachable despite `listSitePages` creating a home
 * page on demand: an editor that was open when the community's last page was
 * removed refetches into an empty list. It is not "impossible", it is "rare",
 * and rendering nothing for it would look like a broken panel. It still offers
 * the add form, because a panel whose only escape hatch is a page reload is a
 * support ticket.
 *
 * ## Why the panel queries rather than taking a server seed
 *
 * Same trade as `DomainPanel`: this panel is dynamically imported and mounted
 * only once its tab is clicked, so fetching on mount keeps the request off the
 * initial load of every PM who never opens it. `EditorRoot` separately receives
 * a server-rendered seed, but that is for the *selected page id* — which the
 * write hooks need before any tab is clicked — not for this list.
 *
 * `useContentBlocks` is read for ONE reason: the permanent-delete dialog has to
 * say how many sections go with the page (D36′). It shares the canvas's query
 * key, so it costs no extra request.
 *
 * ## Selection repair is NOT this panel's job
 *
 * It was, and that was wrong twice over. This panel is dynamically imported and
 * mounted only while its own tab is active, so a repair here never ran in the
 * window that needs it most — a publish applying a staged page removal, which
 * is normally started from the shell header with Sections showing. And
 * `EditorRoot`'s `key={effectivePageId}` (D-SEL) remounts this panel on every
 * page switch, so any state the repair kept between renders was discarded by
 * the same event it was tracking.
 *
 * `EditorRoot` now owns the selection, the repair and the just-created
 * "pending" mark, driven by the pages list `useSiteDiff` already fetches. This
 * panel reports "I created this one, hold the selection" through
 * `onSelectPage`'s options and otherwise owns only its own view state.
 *
 * What the repair fixes is unchanged and worth restating: not a correctness
 * hole — the server answers a write to an unknown page with a 404 and treats an
 * absent page id as home — but the DISHONEST rendering in between. Showing no
 * page as current while every save quietly lands on home is the wrong-but-200
 * failure, and it is the one nobody reports.
 *
 * ## The address control is absent, not disabled, on a published page (D32′)
 *
 * Changing a live page's address is live-immediate, mints a permanent redirect
 * and reserves the old slug forever. That change is deferred to a later PR a
 * human reviews. A *disabled* input would still be an affordance — it says "this
 * is a thing you can do, just not now", which is a promise this build does not
 * keep. So on a published page there is no address field at all. On a page that
 * has never been published there is one, because a draft page has no public URL,
 * mints nothing permanent, and without it a typo made at creation becomes a
 * permanent address the PM can never correct.
 *
 * ## Removal has two shapes, and only one of them is undoable (D36′)
 *
 * A published page is STAGED for removal and stays live until the next publish,
 * so its toast carries an Undo that cancels the staging. A page that has never
 * been published is deleted outright, together with its sections, with no
 * server-side path back — `unstageSitePageDelete` throws when nothing is staged
 * and a draft discard cannot resurrect a soft-deleted row. The confirmation is
 * therefore the ONLY guard on that path, and its copy is constrained: it states
 * that the deletion is immediate, that it cannot be undone, and how many
 * sections go with it. It deliberately never uses the word "publish" — this page
 * has no relationship to publishing, and borrowing that vocabulary would imply a
 * staged action the PM could still reverse.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import dynamic from 'next/dynamic';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Files,
  GripVertical,
  Plus,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  pageIssues,
  TOMBSTONE_BLOCK_TYPE,
  type PageForValidation,
} from '@propertypro/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { ApiRequestError } from '@/lib/api/request-json';
import { isReservedPublicSlug } from '@/lib/middleware/public-host-routes';
import { blocksForPage } from '@/lib/site-editor/blocks-for-page';
import { useContentBlocks } from '@/hooks/use-content-blocks';
import {
  useCreateSitePage,
  useDeleteSitePage,
  useReorderSitePages,
  useSitePages,
  useUnstageSitePageDelete,
  useUpdateSitePage,
  type SitePageSummary,
} from '@/hooks/use-site-pages';

// Mounted only once opened, and code-split with it: the Radix alert-dialog stack
// is ~31 KiB and this route sits inside a hard 700 KiB budget. Nothing is
// confirmed before a click, so nobody pays for it before then.
const ConfirmDialog = dynamic(() => import('../ConfirmDialog').then((m) => m.ConfirmDialog), {
  loading: () => null,
});

/**
 * How many pages a site may have (D39′).
 *
 * A UX guard rail, not a correctness rule: the reorder contract independently
 * caps at 200 and the community-wide section cap is 98. It exists so a runaway
 * script or a confused afternoon does not leave a PM with a nav they cannot
 * read. The server does not enforce it, so this is advisory — which is exactly
 * why it must never be the only thing standing between a user and data loss.
 */
export const MAX_SITE_PAGES = 20;

/**
 * Spelled out rather than interpolated from `MAX_SITE_PAGES`.
 *
 * The two are pinned together by a test, so they cannot drift; a literal is used
 * because the phase's done-criterion greps this file for the exact sentence, and
 * a criterion that a template string can silently satisfy is not a criterion.
 */
export const PAGE_CAP_MESSAGE = 'A site can have up to 20 pages.';

/** How long the Undo on a staged removal stays offered. Mirrors `UNDO_WINDOW_MS`. */
const UNDO_WINDOW_MS = 10_000;

/** The synthetic id the not-yet-created page carries through `pageIssues`. */
const NEW_PAGE_KEY = 'new';

/**
 * Suggests an address from a page name.
 *
 * Deliberately NOT `slugifyHeading` from `@/lib/help/anchors`, which produces
 * the same shape today: that helper's contract is "an anchor inside one help
 * article", and sharing it would mean a change made for a help TOC silently
 * changes what a public page URL is proposed as. The overlap is a coincidence,
 * not an interface.
 *
 * Trailing hyphens are stripped AFTER the length clamp so a name truncated
 * mid-word cannot yield `foo-`, which `SITE_PAGE_SLUG_PATTERN` accepts but reads
 * as a mistake.
 */
export function slugifyPageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
}

/** The public address of a page, as a PM reads it. Home is the site root. */
function pageAddress(page: SitePageSummary): string {
  return page.isHome ? '/' : `/${page.slug}`;
}

/**
 * The one state badge a row shows, most urgent first.
 *
 * One rather than several on purpose: a row is at most 280px wide, and a page
 * that is both hidden from the nav and staged for removal only needs the
 * removal said out loud — that is the state with a deadline attached.
 */
function rowBadges(page: SitePageSummary): Array<{ label: string; className: string }> {
  // A staged removal SUPERSEDES everything else and shows alone. Whether such a
  // page is a draft, or in the nav, is about to stop being true — listing those
  // beside "Removing" is detail about a state that is ending.
  if (page.deleteStagedAt) {
    return [{ label: 'Removing', className: 'bg-status-danger-bg text-status-danger' }];
  }

  // "Draft" and "Not in nav" are independent facts and both are worth knowing,
  // so they COMBINE. Under a single most-urgent-wins badge a draft page the PM
  // had taken out of the nav showed only "Draft", and the nav state was visible
  // nowhere in the collapsed list — only as an icon inside the expanded editor,
  // which is not the surface the PM reads.
  const badges: Array<{ label: string; className: string }> = [];
  if (page.isDraft) {
    badges.push({ label: 'Draft', className: 'bg-status-warning-bg text-status-warning' });
  }
  if (!page.inNav) {
    // "Not in nav", not "Hidden". `in_nav` removes the navigation LINK and
    // nothing else: the page stays published, stays anon-readable at its own
    // address, and is deliberately still listed in `sitemap.xml` (D16). A badge
    // reading "Hidden" is the PM's most likely route to believing they have
    // taken a page off their site when they have not — which for a page they
    // wanted gone is a disclosure they think they made and did not.
    badges.push({ label: 'Not in nav', className: 'bg-status-neutral-bg text-status-neutral' });
  }
  return badges;
}

/**
 * The server's reasons for refusing a page write, in one readable sentence.
 *
 * A `ValidationError` carries a summary MESSAGE plus a `fields` array holding
 * the actionable half — "…still forwards visitors to the page that replaced it.
 * Pick another address." lives in `fields`, not in the message. `requestJson`
 * used to drop it entirely; since it now throws `ApiRequestError` the detail
 * reaches here, and dropping it a second time in the toast would waste the
 * change that carried it.
 *
 * Falls back to the bare message for every other error class, which is what a
 * timeout or a 500 has.
 */
function refusalDetail(error: Error): string {
  const fields = error instanceof ApiRequestError ? error.fields : undefined;
  if (!fields) return error.message;
  // De-duplicated: the same rule can be reported against a name and a slug, and
  // a toast repeating one sentence twice reads as a bug.
  const reasons = [...new Set(fields.map((f) => f.message))];
  return reasons.join(' ');
}

/** Maps a server row onto the shared validator's shape, with optional edits applied. */
function toValidationShape(
  page: SitePageSummary,
  override?: { name?: string; slug?: string },
): PageForValidation {
  return {
    pageId: String(page.id),
    name: override?.name ?? page.name,
    slug: override?.slug ?? page.slug,
    isHome: page.isHome,
    isDraft: page.isDraft,
    // A page already staged for removal is not VALIDATED by the shared checker
    // — it is about to stop existing. It does still hold its ADDRESS, though,
    // until the publish lands: its row stays live in
    // `site_pages_community_slug_partial`, so the server refuses that slug to
    // anyone else. Both form validations below pass `reserveStagedSlugs` so
    // they agree with the server rather than offering an address it will reject.
    // Its NAME is genuinely free (no unique index) — see `assertNameAvailable`.
    deleteStaged: page.deleteStagedAt !== null,
  };
}

function messagesFor(
  issues: ReturnType<typeof pageIssues>,
  pageKey: string,
  field: 'name' | 'slug',
): string[] {
  return issues
    .filter((issue) => issue.pageId === pageKey && issue.field.endsWith(`.${field}`))
    .map((issue) => issue.message);
}

/** "no sections" / "1 section" / "4 sections" — the count D36′ requires, said in words. */
function sectionPhrase(count: number): string {
  if (count === 0) return 'no sections';
  if (count === 1) return '1 section';
  return `${count} sections`;
}

export interface PagesPanelProps {
  communityId: number;
  /**
   * True when the parent moved the selection in response to a click in THIS
   * panel, so focus should return to the row that was clicked.
   *
   * `EditorRoot`'s `key={effectivePageId}` (D-SEL) remounts this panel on every
   * page switch, which destroys the button the PM just activated and drops
   * focus to `<body>` — the panel's primary action was the one action that
   * stranded a keyboard user at the top of the document. The flag has to come
   * from above for the same reason the pending mark does: any state this panel
   * set would die with the instance that set it.
   *
   * NOT simply "focus the selected row on mount": opening the Pages tab also
   * mounts this panel, and stealing focus there would yank it out of whatever
   * the PM was doing.
   */
  restoreFocusToSelectedRow?: boolean;
  /**
   * The page being edited, or `null` while none is known.
   *
   * Required, not defaulted: a panel that invented its own selection would
   * disagree with the one the block writes actually use.
   */
  selectedPageId: number | null;
  /**
   * Move the editor onto a page.
   *
   * `pending` marks a page this panel has just CREATED and that the cached list
   * does not contain yet. `EditorRoot` holds the selection there instead of
   * repairing it away — without that, `create` resolves, the selection moves to
   * the new id, and the still-stale list makes the repair read it as a page that
   * does not exist and bounce the PM back to home. The PM then adds sections to
   * the wrong page, having watched the editor look correct for a frame.
   *
   * It is a flag rather than a second callback because the two always happen
   * together: there is no "mark pending without selecting".
   */
  onSelectPage: (
    pageId: number,
    options?: {
      pending?: boolean;
      /**
       * Text for the parent's live region. Belongs to the parent because a page
       * change remounts THIS panel, so a region inside it is rebuilt by the very
       * update it would be reporting and announces nothing.
       */
      announce?: string;
    },
  ) => void;
  /**
   * A page this PM has just deleted outright, told to the parent so its
   * selection repair does not announce the PM's own action back at them.
   *
   * The repair says "The page you were editing is no longer available. You are
   * now editing the home page." — written for the case it exists for, a
   * co-manager publishing a staged removal of the page you had open. Fired one
   * tick after the PM's own deliberate delete, on top of the "X was deleted."
   * they already got, it reads as a second, unexplained event.
   *
   * Only the immediate hard delete needs this. A staged removal leaves the page
   * in the list until publish, so it triggers no repair.
   *
   * Required, not optional: a prop whose absence silently disables a behaviour
   * is how 11b-1 shipped a dead publish button.
   */
  onPageRemoved: (pageId: number) => void;
}

export function PagesPanel({
  communityId,
  selectedPageId,
  restoreFocusToSelectedRow = false,
  onSelectPage,
  onPageRemoved,
}: PagesPanelProps) {
  const { data, isPending, isError, error, refetch } = useSitePages(communityId);
  // Shares the canvas's query key, so this adds no request. Read solely to say
  // how many sections a permanent delete takes with it (D36′).
  const { data: blocks } = useContentBlocks(communityId);

  const createPage = useCreateSitePage(communityId);
  const updatePage = useUpdateSitePage(communityId);
  const reorderPages = useReorderSitePages(communityId);
  const deletePage = useDeleteSitePage(communityId);
  const unstageDelete = useUnstageSitePageDelete(communityId);

  const hintId = useId();
  // Announces ONLY the changes that have no visible confirmation of their own
  // AND do not switch page — which leaves the REORDER (the list rearranges in
  // place). A creation also has no visible confirmation, but it moves the
  // selection and therefore remounts this panel, so its announcement is handed
  // to `EditorRoot` through `onSelectPage` instead; a live region rebuilt by
  // the update it is reporting announces nothing.
  //
  // Everything else toasts, and a toast is itself a live region: announcing in
  // both is the double-announcement `GalleryImagesField` documents avoiding.
  const [announcement, setAnnouncement] = useState('');
  const [expandedPageId, setExpandedPageId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [slugDraft, setSlugDraft] = useState('');
  const [isAdding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SitePageSummary | null>(null);
  // Focus returns here when the confirm closes: the dialog is code-split and has
  // no registered Radix trigger, so Radix's own restore would strand focus on
  // <body>. See ConfirmDialog.
  const removeButtonRef = useRef<HTMLButtonElement>(null);
  /**
   * Where focus goes when the control it was on stops existing.
   *
   * `removeButtonRef` covers Cancel; it cannot cover Confirm, because the row
   * holding that button unmounts a moment after the dialog closes. See the
   * effect below.
   */
  const listRef = useRef<HTMLUListElement>(null);
  /** The row for the currently selected page — see `restoreFocusToSelectedRow`. */
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  const pages = useMemo(() => data ?? [], [data]);

  /*
   * Selection REPAIR and the just-created "pending" mark used to live here, and
   * both were dead in the real tree.
   *
   * `EditorRoot` owns `selectedPageId`, and its `key={effectivePageId}` (D-SEL)
   * remounts this panel on every page switch — so a mark set in `onSuccess`
   * below was back to `null` on the very next render, and its regression test
   * could not see that because it drove the change with `rerender`, which
   * preserves state. Repair had a second, independent hole: this panel is
   * dynamically imported and mounted only while its own tab is active, so it was
   * absent in the window where the selected page most commonly disappears — a
   * publish that applies a staged removal, normally started from the shell
   * header with Sections showing.
   *
   * Both now live in `EditorRoot`, next to the state they repair and driven by
   * the pages list it already holds. This panel reports "I created this one,
   * hold the selection" through `onSelectPage`'s `pending` flag and otherwise
   * owns only its own view state.
   */

  /*
   * Focus follows the selection across the remount.
   *
   * Mount-only (`[]`), and gated on a flag the PARENT sets: this panel is
   * remounted both by a page switch (where the PM's focus was on a row that no
   * longer exists) and by opening the Pages tab (where stealing focus would be
   * an ambush). Only the first deserves it.
   *
   * The row is the right target rather than the list: the PM pressed a specific
   * row, and returning them to it keeps Tab order where they left it.
   */
  useEffect(() => {
    if (!restoreFocusToSelectedRow) return;
    selectedRowRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  // A row that disappeared underneath an open editor must not leave that editor
  // open over nothing — and the reorder/nav controls inside it would then be
  // acting on an id the server no longer knows. This one is genuinely
  // panel-local: `expandedPageId` is this panel's own disclosure state.
  useEffect(() => {
    if (expandedPageId !== null && data !== undefined && !pages.some((p) => p.id === expandedPageId)) {
      setExpandedPageId(null);
      /*
       * …and take focus somewhere that still exists.
       *
       * `ConfirmDialog` restores focus to `removeButtonRef` on close, which is
       * correct for Cancel and useless for Confirm: `confirmRemove` closes the
       * dialog BEFORE the mutation resolves, so focus lands on the remove
       * button, and the refetch that follows unmounts the row out from under
       * it. A focused element removed from the DOM sends focus to `<body>`, and
       * a keyboard PM is then at the top of the document with no idea where
       * they are. The dialog's own `isConnected` guard cannot help — at the
       * moment it runs, the button is still connected.
       *
       * The list container is the right landing spot rather than, say, the
       * first row: it is where the deleted page WAS, it is stable across
       * refetches, and it does not silently move the PM's attention onto a
       * different page's controls.
       */
      listRef.current?.focus();
    }
  }, [data, expandedPageId, pages]);

  const expandedPage = pages.find((page) => page.id === expandedPageId) ?? null;

  const openEditor = useCallback((page: SitePageSummary) => {
    setExpandedPageId((current) => {
      if (current === page.id) return null;
      // Drafts are re-seeded from the server row on every open, so an abandoned
      // edit never leaks into the next page's form.
      setNameDraft(page.name);
      setSlugDraft(page.slug);
      return page.id;
    });
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────
  // Both runs use the SHARED validator with the app's own reserved-slug
  // predicate injected, so the editor and the publish gate cannot disagree about
  // what a legal address is. `retiredSlugs` is not available client-side; the
  // server re-runs the same function and is the actual gate.

  const createIssues = useMemo(
    () =>
      pageIssues({
        pages: [
          ...pages.map((page) => toValidationShape(page)),
          { pageId: NEW_PAGE_KEY, name: newName, slug: newSlug, isHome: false },
        ],
        isReserved: isReservedPublicSlug,
        // This form asks "can this page take this address now?", not "is the
        // set about to go live valid?" — so a staged page still holds its slug.
        reserveStagedSlugs: true,
      }),
    [newName, newSlug, pages],
  );
  const createNameErrors = messagesFor(createIssues, NEW_PAGE_KEY, 'name');
  const createSlugErrors = messagesFor(createIssues, NEW_PAGE_KEY, 'slug');
  // Nothing is complained about before the PM has typed anything — an error
  // shown on an untouched form reads as the form being broken.
  const showCreateErrors = newName.trim().length > 0 || newSlug.length > 0;
  const canCreate =
    newName.trim().length > 0 &&
    newSlug.length > 0 &&
    createNameErrors.length === 0 &&
    createSlugErrors.length === 0;

  /*
   * The edited page goes LAST, exactly as the add form puts `NEW_PAGE_KEY` last.
   *
   * `pageIssues` attributes a name or slug clash to the SECOND occurrence it
   * sees, so in list order the edited page only hears about a clash when it
   * happens to sit after the page it collides with. Renaming the EARLIER of two
   * pages onto the later one's name filed the issue against the later page —
   * which this panel never displays, because `messagesFor` filters on the
   * edited page's id. Save stayed enabled, `updateSitePage` had no uniqueness
   * rule to stop it, and the clash surfaced only as a server error on the next
   * publish, naming a page the PM never touched.
   *
   * Ordering the edited page last makes the check symmetric: it is always the
   * second occurrence of any name it duplicates, whichever direction the PM
   * renames in.
   */
  const editIssues = useMemo(() => {
    if (expandedPage === null) return [];
    const others = pages.filter((page) => page.id !== expandedPage.id);
    return pageIssues({
      pages: [
        ...others.map((page) => toValidationShape(page)),
        toValidationShape(expandedPage, { name: nameDraft, slug: slugDraft }),
      ],
      isReserved: isReservedPublicSlug,
      // Same question as the add form: what can this page take right now.
      reserveStagedSlugs: true,
    });
  }, [expandedPage, nameDraft, pages, slugDraft]);
  const editKey = expandedPage === null ? '' : String(expandedPage.id);
  const editNameErrors = messagesFor(editIssues, editKey, 'name');
  const editSlugErrors = messagesFor(editIssues, editKey, 'slug');

  // ── Reorder ───────────────────────────────────────────────────────────────
  // Home is pinned at the site root and is not reorderable, so the submitted
  // order is the non-home ids only — exactly what the contract wants. Positions
  // are announced against the WHOLE list (home is 1) because that is the list
  // the PM can see; announcing an index into a subset the UI never shows would
  // be accurate and useless.

  const reorderableIds = useMemo(
    () => pages.filter((page) => !page.isHome).map((page) => page.id),
    [pages],
  );
  const pinnedCount = pages.length - reorderableIds.length;

  const moveToIndex = useCallback(
    (page: SitePageSummary, toIndex: number) => {
      const from = reorderableIds.indexOf(page.id);
      if (from === -1 || toIndex < 0 || toIndex >= reorderableIds.length || toIndex === from) {
        // A soft stop, not an error: these controls are reachable by keyboard
        // and a PM holding ArrowUp should hit the end of the list, not a toast.
        return;
      }
      const next = [...reorderableIds];
      next.splice(from, 1);
      next.splice(toIndex, 0, page.id);
      setAnnouncement(
        `${page.name} moved to position ${toIndex + 1 + pinnedCount} of ${pages.length}.`,
      );
      reorderPages.mutate(
        { orderedPageIds: next },
        {
          onError: (mutationError) => {
            setAnnouncement(`${page.name} could not be moved.`);
            toast.error(`We couldn't reorder your pages. ${mutationError.message}`);
          },
        },
      );
    },
    [pages.length, pinnedCount, reorderPages, reorderableIds],
  );

  const handleGripKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, page: SitePageSummary) => {
      const from = reorderableIds.indexOf(page.id);
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          moveToIndex(page, from - 1);
          return;
        case 'ArrowDown':
          event.preventDefault();
          moveToIndex(page, from + 1);
          return;
        case 'Home':
          event.preventDefault();
          moveToIndex(page, 0);
          return;
        case 'End':
          event.preventDefault();
          moveToIndex(page, reorderableIds.length - 1);
          return;
        default:
          // Every other key belongs to the browser (Tab, Enter, typeahead).
          return;
      }
    },
    [moveToIndex, reorderableIds],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  const submitCreate = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (!canCreate || createPage.isPending) return;
      const name = newName.trim();
      createPage.mutate(
        { name, slug: newSlug },
        {
          onSuccess: (page) => {
            setAdding(false);
            setNewName('');
            setNewSlug('');
            setSlugTouched(false);
            // Land the PM on what they just made — otherwise the next section
            // they add goes onto the page they were already looking at. The
            // pending mark holds the selection until the refetch catches up;
            // `EditorRoot` owns it, because this panel is remounted by the page
            // switch this very call triggers.
            //
            // The announcement rides along for the same reason. Setting it on
            // THIS panel's live region would announce nothing at all: the
            // region is torn down and rebuilt by the same update, and a live
            // region only reports changes it was mounted to observe.
            onSelectPage(page.id, { pending: true, announce: `${page.name} added.` });
          },
          onError: (mutationError) => {
            toast.error(`We couldn't add that page. ${refusalDetail(mutationError)}`);
          },
        },
      );
    },
    [canCreate, createPage, newName, newSlug, onSelectPage],
  );

  const saveField = useCallback(
    (page: SitePageSummary, patch: { name?: string; slug?: string; inNav?: boolean }, done: string) => {
      updatePage.mutate(
        { pageId: page.id, ...patch },
        {
          onSuccess: () => {
            toast.success(done);
          },
          onError: (mutationError) => {
            toast.error(`We couldn't save that change. ${refusalDetail(mutationError)}`);
          },
        },
      );
    },
    [updatePage],
  );

  const cancelStagedRemoval = useCallback(
    (page: SitePageSummary) => {
      unstageDelete.mutate(
        { pageId: page.id },
        {
          onSuccess: () => toast.success(`${page.name} is no longer being removed.`),
          onError: (mutationError) =>
            toast.error(`We couldn't cancel that removal. ${mutationError.message}`),
        },
      );
    },
    [unstageDelete],
  );

  const confirmRemove = useCallback(() => {
    const page = removeTarget;
    if (page === null) return;
    setRemoveTarget(null);
    deletePage.mutate(
      { pageId: page.id },
      {
        onSuccess: ({ staged }) => {
          if (!staged) {
            // Told BEFORE the toast, so the parent's repair — which fires on
            // the same invalidation — already knows this was self-inflicted and
            // stays quiet. See `PagesPanelProps.onPageRemoved`.
            onPageRemoved(page.id);
            // Nothing to offer here: there is no server-side path back, so an
            // Undo affordance would be a lie. The dialog was the guard.
            toast.success(`${page.name} was deleted.`);
            return;
          }
          toast.success(`${page.name} will be removed from your live site when you publish.`, {
            duration: UNDO_WINDOW_MS,
            dismissible: true,
            closeButton: true,
            action: {
              label: 'Undo',
              // Safe by construction even if this toast outlives its window or
              // the PM publishes first: `unstage` is addressed by page id and
              // the server refuses when nothing is staged. Unlike a section
              // undo, it replays no content, so a late click cannot resurrect
              // stale data — it can only fail loudly.
              onClick: () => cancelStagedRemoval(page),
            },
          });
        },
        onError: (mutationError) => {
          toast.error(`We couldn't remove that page. ${mutationError.message}`);
        },
      },
    );
  }, [cancelStagedRemoval, deletePage, onPageRemoved, removeTarget]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (isPending) {
    return (
      <div data-testid="site-pages-loading" className="space-y-2">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (isError || data === undefined) {
    return (
      <div data-testid="site-pages-read-error" className="space-y-4">
        <AlertBanner
          status="danger"
          title="We couldn't load your pages."
          description={error?.message ?? 'Please try again.'}
        />
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const atCap = pages.length >= MAX_SITE_PAGES;
  const removeTargetIsLive = removeTarget !== null && !removeTarget.isDraft;
  const removeTargetSections =
    removeTarget === null
      ? 0
      : blocksForPage(blocks, removeTarget.id).filter(
          (block) => block.blockType !== TOMBSTONE_BLOCK_TYPE,
        ).length;

  const addForm = atCap ? (
    <p data-testid="site-pages-cap" className="text-xs text-content-tertiary">
      {PAGE_CAP_MESSAGE}
    </p>
  ) : isAdding ? (
    <form onSubmit={submitCreate} className="space-y-3 rounded-md border border-edge p-3">
      <div className="space-y-1">
        <Label htmlFor="site-page-new-name">Page name</Label>
        <Input
          id="site-page-new-name"
          value={newName}
          onChange={(event) => {
            const value = event.target.value;
            setNewName(value);
            // Slugify UNTIL the PM edits the address themselves — after that the
            // address is theirs and typing in the name must not overwrite it.
            if (!slugTouched) setNewSlug(slugifyPageName(value));
          }}
          aria-invalid={showCreateErrors && createNameErrors.length > 0}
          aria-describedby={
            showCreateErrors && createNameErrors.length > 0
              ? 'site-page-new-name-error'
              : undefined
          }
        />
        {showCreateErrors && createNameErrors.length > 0 && (
          <p id="site-page-new-name-error" role="alert" className="text-xs text-status-danger">
            {createNameErrors.join(' ')}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="site-page-new-slug">Web address</Label>
        <div className="flex items-center gap-1">
          <span aria-hidden="true" className="text-sm text-content-tertiary">
            /
          </span>
          <Input
            id="site-page-new-slug"
            value={newSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setNewSlug(event.target.value);
            }}
            aria-invalid={showCreateErrors && createSlugErrors.length > 0}
            aria-describedby={
              showCreateErrors && createSlugErrors.length > 0
                ? 'site-page-new-slug-error'
                : undefined
            }
          />
        </div>
        {showCreateErrors && createSlugErrors.length > 0 && (
          <p id="site-page-new-slug-error" role="alert" className="text-xs text-status-danger">
            {createSlugErrors.join(' ')}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canCreate || createPage.isPending}>
          {createPage.isPending ? 'Adding…' : 'Add page'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setAdding(false);
            setNewName('');
            setNewSlug('');
            setSlugTouched(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  ) : (
    <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add a page
    </Button>
  );

  if (pages.length === 0) {
    return (
      <div data-testid="site-pages-empty" className="space-y-3">
        <EmptyState
          size="sm"
          icon={Files}
          title="No pages yet"
          description="Your site's pages will show up here."
        />
        {addForm}
      </div>
    );
  }

  return (
    <div data-testid="site-pages" className="space-y-3">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <p id={hintId} className="sr-only">
        Press Arrow Up or Arrow Down to move this page one position. Press Home to move it to
        the top, or End to move it to the bottom.
      </p>

      {/* `tabIndex={-1}`: programmatically focusable so a vanished row has
          somewhere to send focus, but never a Tab stop of its own. */}
      <ul
        ref={listRef}
        tabIndex={-1}
        aria-label="Site pages"
        aria-busy={reorderPages.isPending}
        className="flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        {pages.map((page, index) => {
          const selected = page.id === selectedPageId;
          const badges = rowBadges(page);
          const reorderIndex = reorderableIds.indexOf(page.id);
          const canReorder = reorderIndex !== -1;
          const canUp = canReorder && reorderIndex > 0;
          const canDown = canReorder && reorderIndex < reorderableIds.length - 1;
          const expanded = expandedPageId === page.id;
          const editorId = `${hintId}-editor-${page.id}`;
          const staged = page.deleteStagedAt !== null;

          return (
            <li key={page.id} className="flex flex-col gap-1">
              <div
                data-testid={`site-page-row-${page.id}`}
                className={cn(
                  'flex min-h-11 w-full min-w-0 items-center gap-1 rounded-md border px-1 py-1 transition-colors duration-quick',
                  selected
                    ? 'border-interactive bg-interactive-subtle'
                    : 'border-edge-subtle bg-surface-card hover:bg-surface-hover',
                )}
              >
                {/* Rendered for every row so the row keeps one shape and one tab
                    order; home is disabled rather than missing, because a
                    control that vanishes on one row makes the list jump. */}
                {/*
                  No `aria-roledescription="sortable item"` and no `cursor-grab`.
                  Both promise a pointer drag this control does not implement —
                  there are no pointer handlers here at all, only `onKeyDown`.
                  `aria-roledescription` replaces the announced role outright, so
                  a screen-reader user was told "sortable item" and given no way
                  to sort it by the means that phrasing implies; `cursor-grab`
                  told a mouse user the same lie. The real affordance is the
                  arrow keys, and `aria-keyshortcuts` below is what announces it.
                */}
                <button
                  type="button"
                  aria-label={`Reorder ${page.name}, position ${index + 1} of ${pages.length}`}
                  aria-describedby={hintId}
                  aria-keyshortcuts="ArrowUp ArrowDown Home End"
                  disabled={!canUp && !canDown}
                  onKeyDown={(event) => handleGripKeyDown(event, page)}
                  data-testid={`site-page-grip-${page.id}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:text-content-disabled"
                >
                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  ref={selected ? selectedRowRef : undefined}
                  onClick={() =>
                    // The announcement is passed UP because this panel is
                    // remounted by the very switch it is reporting — a live
                    // region inside it is torn down and rebuilt before the
                    // string can be announced. `EditorRoot` owns the region
                    // that survives. The panel supplies the text because it is
                    // the side that knows the page's name.
                    onSelectPage(page.id, { announce: `Now editing ${page.name}.` })
                  }
                  aria-current={selected ? 'page' : undefined}
                  data-testid={`site-page-select-${page.id}`}
                  className="flex min-h-9 min-w-0 flex-1 flex-col items-start rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span
                    className={cn(
                      'w-full truncate text-sm',
                      selected ? 'font-semibold text-content' : 'text-content-secondary',
                    )}
                  >
                    {page.name}
                  </span>
                  <span className="w-full truncate text-xs text-content-tertiary">
                    {pageAddress(page)}
                  </span>
                </button>

                {badges.map((badge) => (
                  <span
                    key={badge.label}
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium',
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                ))}

                <button
                  type="button"
                  disabled={!canUp}
                  onClick={() => moveToIndex(page, reorderIndex - 1)}
                  aria-label={`Move ${page.name} up`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:text-content-disabled disabled:hover:bg-transparent"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={!canDown}
                  onClick={() => moveToIndex(page, reorderIndex + 1)}
                  aria-label={`Move ${page.name} down`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:text-content-disabled disabled:hover:bg-transparent"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => openEditor(page)}
                  aria-expanded={expanded}
                  aria-controls={editorId}
                  aria-label={`Page settings for ${page.name}`}
                  data-testid={`site-page-settings-${page.id}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-content-tertiary hover:bg-surface-hover hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <Settings2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {expanded && (
                <div
                  id={editorId}
                  data-testid={`site-page-editor-${page.id}`}
                  className="space-y-3 rounded-md border border-edge p-3"
                >
                  {/*
                    The editor is a draft-then-publish surface and these
                    controls are not, which nothing said.
                    `site_pages` has no draft/published column pair, so a
                    rename, a nav toggle and a reorder all reach the public site
                    the instant they are saved — and `diff-pages.ts` correctly
                    excludes them, so the publish sheet reports "0 changes"
                    immediately afterwards. A PM who reads that as "nothing has
                    happened yet" is wrong in the one direction that matters.

                    Said once, at the top of the controls it applies to, rather
                    than three times next to each: the toasts below repeat it
                    per action. The address control is the exception and says so
                    itself — it renders only on a page that is not live at all.
                  */}
                  <p
                    data-testid={`site-page-live-hint-${page.id}`}
                    className="text-xs text-content-secondary"
                  >
                    A page&apos;s name, navigation visibility and order go live straight away —
                    they are not held back for your next publish.
                  </p>

                  {/*
                    ABSENT on a staged page, not disabled — the same rule D32′
                    applies to the address control just below.
                    `pageIssues` skips a staged page as a SUBJECT as well as a
                    candidate, so the validation goes quiet here: renaming a
                    staged page onto a name another page holds shows no error
                    and enables Save, and the server then refuses the write.
                    Rather than teach the validator about a subject on its way
                    out, drop the control — the useful action on a staged page
                    is "Cancel removal", which is further down this same panel
                    and stays reachable.
                  */}
                  {!staged && (
                    <div className="space-y-1">
                      <Label htmlFor={`${editorId}-name`}>Page name</Label>
                      <Input
                        id={`${editorId}-name`}
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        aria-invalid={editNameErrors.length > 0}
                      />
                      {editNameErrors.length > 0 && (
                        <p role="alert" className="text-xs text-status-danger">
                          {editNameErrors.join(' ')}
                        </p>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          editNameErrors.length > 0 ||
                          nameDraft.trim() === page.name ||
                          updatePage.isPending
                        }
                        onClick={() =>
                          saveField(
                            page,
                            { name: nameDraft.trim() },
                            `Page renamed to ${nameDraft.trim()}. This is live on your site now.`,
                          )
                        }
                      >
                        Save name
                      </Button>
                    </div>
                  )}

                  {/* D32′: only a page that has never been published gets an
                      address control, and it is ABSENT — not disabled — on the
                      rest. Home is pinned at the root and excluded outright.

                      Deliberately NOT `isLazyDraftHome`, despite spelling the
                      same condition. That predicate means "an artefact of lazy
                      creation, not a PM action"; this means "home's slug is
                      pinned to the root". Two different rules that happen to
                      agree today — collapsing them would couple this control to
                      a publish-accounting decision it has nothing to do with. */}
                  {page.isDraft && !page.isHome && (
                    <div className="space-y-1">
                      <Label htmlFor={`${editorId}-slug`}>Web address</Label>
                      <div className="flex items-center gap-1">
                        <span aria-hidden="true" className="text-sm text-content-tertiary">
                          /
                        </span>
                        <Input
                          id={`${editorId}-slug`}
                          value={slugDraft}
                          onChange={(event) => setSlugDraft(event.target.value)}
                          aria-invalid={editSlugErrors.length > 0}
                        />
                      </div>
                      {editSlugErrors.length > 0 && (
                        <p role="alert" className="text-xs text-status-danger">
                          {editSlugErrors.join(' ')}
                        </p>
                      )}
                      <p className="text-xs text-content-tertiary">
                        This page is not on your live site yet, so changing its address changes
                        nothing a visitor has seen.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          editSlugErrors.length > 0 ||
                          slugDraft === page.slug ||
                          slugDraft.length === 0 ||
                          updatePage.isPending
                        }
                        onClick={() =>
                          saveField(page, { slug: slugDraft }, `Address changed to /${slugDraft}.`)
                        }
                      >
                        Save address
                      </Button>
                    </div>
                  )}

                  {!page.isHome && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-pressed={page.inNav}
                      disabled={updatePage.isPending}
                      onClick={() =>
                        saveField(
                          page,
                          { inNav: !page.inNav },
                          page.inNav
                            ? `${page.name} is out of your navigation now. The page itself stays online.`
                            : `${page.name} shows in your navigation now.`,
                        )
                      }
                    >
                      {/* `aria-pressed` alone is invisible: an `outline` Button
                          has no pressed styling, and the row's "Hidden" badge is
                          suppressed whenever the page is also a draft or staged
                          for removal — so a sighted PM would have no signal at
                          all in exactly the states that matter. The icon carries
                          it, and stays `aria-hidden` because the accessible name
                          must keep describing the CONTROL, not its state. */}
                      {page.inNav ? (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      )}
                      Show in navigation
                    </Button>
                  )}

                  {/* Says what the toggle does NOT do. Taking a page out of the
                      nav is the closest thing this panel has to "unpublish", and
                      a PM reaching for it to take a page down would otherwise
                      believe they had. */}
                  {!page.isHome && (
                    <p className="text-xs text-content-secondary">
                      This only removes the link from your navigation. The page stays online at
                      its own address and search engines can still find it. To take it off your
                      site, remove it.
                    </p>
                  )}

                  {/* Home has no removal control at all: every layout renders a
                      site root, and the server refuses. An affordance that
                      always 400s is worse than none. */}
                  {!page.isHome &&
                    (staged ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={unstageDelete.isPending}
                        onClick={() => cancelStagedRemoval(page)}
                      >
                        Cancel removal
                      </Button>
                    ) : (
                      <Button
                        ref={removeButtonRef}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={deletePage.isPending}
                        onClick={() => setRemoveTarget(page)}
                        className="text-status-danger"
                      >
                        {page.isDraft ? 'Delete page' : 'Remove page'}
                      </Button>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-content-tertiary">Pick a page to edit the sections on it.</p>

      {addForm}

      {removeTarget !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setRemoveTarget(null);
          }}
          restoreFocusTo={removeButtonRef}
          title={
            removeTargetIsLive
              ? `Remove ${removeTarget.name}?`
              : `Delete ${removeTarget.name}?`
          }
          description={
            removeTargetIsLive
              ? // Staged: reversible, and the copy says how.
                `${removeTarget.name} stays on your live site until you publish. You'll have a moment to undo this.`
              : // D36′. Immediate, permanent, and the section count — and no
                // form of the word "publish", which would imply a staged action
                // this page cannot have.
                `${removeTarget.name} has ${sectionPhrase(removeTargetSections)}. Deleting removes the page and everything on it immediately, and this cannot be undone.`
          }
          confirmLabel={removeTargetIsLive ? 'Remove page' : 'Delete page'}
          cancelLabel="Keep page"
          destructive
          pending={deletePage.isPending}
          onConfirm={confirmRemove}
        />
      ) : null}
    </div>
  );
}
