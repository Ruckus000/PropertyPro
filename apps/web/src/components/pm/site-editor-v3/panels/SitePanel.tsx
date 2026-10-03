'use client';

/**
 * The site's search settings and footer, as two forms (website builder v4,
 * Phase 5: they live in the Settings view's "Search & sharing" and "General"
 * tabs). The site icon, sharing image and photo storage are separate small
 * components below, placed by the Settings view.
 *
 * ## These writes are live-immediate, and the copy says so
 *
 * Everything here lands in `communities.branding`, which is outside the draft
 * layer: the publish flow promotes `site_blocks` rows only. So Save is public
 * on the next request, exactly like the community's web address already is.
 * That is stated next to the button rather than in a toast afterwards.
 *
 * ## Why Save is explicit rather than autosaved
 *
 * Two of these fields are public-facing and one of them carries a counsel
 * warning. An 800 ms debounce publishing a half-typed statutory attestation is
 * the wrong default, whatever the rest of the editor does.
 *
 * ## One form per part
 *
 * Each part sends only its own fields (the PATCH leaves absent fields alone),
 * and resyncs only when ITS stored values change — so saving the footer never
 * resets a half-edited search title, and the other way round.
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AlertBanner } from '@/components/shared/alert-banner';
import { buildPublicAssetUrl } from '@/lib/site-assets/public-url';
import {
  FOOTER_ASSOCIATION_NAME_MAX_LENGTH,
  FOOTER_NOTE_MAX_LENGTH,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  STATUTORY_FOOTER_LINE,
  type SiteStorage,
} from '@/lib/site-editor/site-settings';
import { formatBytes } from '@/lib/utils/format-bytes';
import {
  useSiteSettings,
  useUpdateSiteSettings,
  useUploadFavicon,
  useUploadShareImage,
  type SiteSettingsRecord,
} from '@/hooks/use-site-settings';
import { SerpPreview } from './SerpPreview';

export interface SitePanelProps {
  communityId: number;
  community: {
    name: string;
    slug: string;
    communityType: 'condo_718' | 'hoa_720' | 'apartment';
    city?: string | null;
  };
  tagline?: string | null;
  /** Server-rendered initial state, so the form is usable on first paint. */
  initialSettings?: SiteSettingsRecord;
  /** Which form: search results, or the footer. */
  part: 'search' | 'footer';
}

/** Code points, not UTF-16 units — the same unit the server enforces. */
function countCharacters(value: string): number {
  return [...value].length;
}

function CharacterCount({ value, max }: { value: string; max: number }) {
  const remaining = max - countCharacters(value);
  const over = remaining < 0;
  return (
    <span
      className={over ? 'text-sm text-status-danger' : 'text-sm text-content-tertiary'}
      // Announced only when it matters, so typing does not chatter.
      aria-live={over ? 'polite' : 'off'}
    >
      {over ? `${Math.abs(remaining)} over` : `${remaining} left`}
    </span>
  );
}

/**
 * Photo storage against the plan quota. Read-only: the counter is charged by
 * the upload routes, and the settings PATCH body cannot reach it.
 *
 * A null quota means the plan sets no limit, so only the usage is shown —
 * drawing a bar would mean inventing a denominator. Over quota (reachable
 * after a plan downgrade) the bar is full and the text says so; the colour
 * change alone is not the signal.
 */
export function StorageMeter({ storage }: { storage: SiteStorage }) {
  const { assetsBytesUsed, quotaBytes } = storage;
  const used = formatBytes(assetsBytesUsed);

  if (quotaBytes === null) {
    return (
      <section aria-labelledby="site-storage-heading" className="space-y-2">
        <h3 id="site-storage-heading" className="text-sm font-semibold text-content">
          Photo storage
        </h3>
        <p className="text-sm text-content-tertiary">{used} used</p>
      </section>
    );
  }

  const percent = Math.min(100, Math.round((assetsBytesUsed / quotaBytes) * 100));
  const overQuota = assetsBytesUsed > quotaBytes;
  const summary = `${used} of ${formatBytes(quotaBytes)} used`;

  return (
    <section aria-labelledby="site-storage-heading" className="space-y-2">
      <h3 id="site-storage-heading" className="text-sm font-semibold text-content">
        Photo storage
      </h3>
      <div
        role="progressbar"
        aria-label="Photo storage used"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={summary}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={
            overQuota ? 'h-full rounded-full bg-status-danger' : 'h-full rounded-full bg-interactive'
          }
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-sm text-content-tertiary">
        {summary}
        {overQuota ? ' — over your plan’s limit' : null}
      </p>
    </section>
  );
}

export function SitePanel({
  communityId,
  community,
  tagline,
  initialSettings,
  part,
}: SitePanelProps) {
  const { data: record } = useSiteSettings(communityId, initialSettings);
  const update = useUpdateSiteSettings(communityId);

  const [seoTitle, setSeoTitle] = useState(record?.settings.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(record?.settings.seoDescription ?? '');
  const [searchIndexing, setSearchIndexing] = useState(record?.settings.searchIndexing ?? true);
  const [associationName, setAssociationName] = useState(record?.footer.associationName ?? '');
  const [note, setNote] = useState(record?.footer.note ?? '');
  const [showStatutoryLine, setShowStatutoryLine] = useState(
    record?.footer.showStatutoryLine ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  // Resync when THIS part's stored values actually change.
  //
  // `useState(props.x)` never resyncs on its own, and these are public-facing
  // writes — a background refetch must not silently clobber someone mid-edit.
  // Keying on CONTENT rather than object identity means a refetch returning the
  // same values leaves the form alone; only a real change (another manager
  // saved, or this tab's own save landed) rewrites it, and then showing the
  // truth is the point. Only this part's fields are in the key, so an image
  // upload or the other part's save never resets these.
  const storedKey = record
    ? JSON.stringify(
        part === 'search'
          ? [record.settings.seoTitle, record.settings.seoDescription, record.settings.searchIndexing]
          : record.footer,
      )
    : null;
  const [syncedKey, setSyncedKey] = useState(storedKey);
  if (storedKey !== syncedKey) {
    setSyncedKey(storedKey);
    setSeoTitle(record?.settings.seoTitle ?? '');
    setSeoDescription(record?.settings.seoDescription ?? '');
    setSearchIndexing(record?.settings.searchIndexing ?? true);
    setAssociationName(record?.footer.associationName ?? '');
    setNote(record?.footer.note ?? '');
    setShowStatutoryLine(record?.footer.showStatutoryLine ?? false);
    setError(null);
  }

  // While a save is in flight the fields are read-only: the resync above
  // replaces the form with the saved values when it lands, which would drop
  // anything typed in between. Read-only, not disabled, so focus stays put.

  const overLimit =
    part === 'search'
      ? countCharacters(seoTitle) > SEO_TITLE_MAX_LENGTH ||
        countCharacters(seoDescription) > SEO_DESCRIPTION_MAX_LENGTH
      : countCharacters(associationName) > FOOTER_ASSOCIATION_NAME_MAX_LENGTH ||
        countCharacters(note) > FOOTER_NOTE_MAX_LENGTH;

  // The preview renders the values being typed, through the same resolvers the
  // real page uses.
  const previewSettings = useMemo(
    () => ({
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      searchIndexing,
      favicon: record?.settings.favicon ?? null,
      shareImage: record?.settings.shareImage ?? null,
    }),
    [seoTitle, seoDescription, searchIndexing, record?.settings.favicon, record?.settings.shareImage],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      if (overLimit) {
        setError('One of these is too long. Shorten it and try again.');
        return;
      }

      // Empty means "clear it", which is a real choice here — unlike the
      // urgent notice, where empty is an error.
      const patch =
        part === 'search'
          ? {
              seoTitle: seoTitle.trim() || null,
              seoDescription: seoDescription.trim() || null,
              searchIndexing,
            }
          : {
              associationName: associationName.trim() || null,
              note: note.trim() || null,
              showStatutoryLine,
            };
      update.mutate(patch, {
        onSuccess: () => toast.success('Saved. Your website is updated.'),
        onError: (err) => setError(err.message),
      });
    },
    [
      part,
      overLimit,
      update,
      seoTitle,
      seoDescription,
      searchIndexing,
      associationName,
      note,
      showStatutoryLine,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <AlertBanner status="danger" title={error} /> : null}

      {part === 'search' ? (
        <section aria-labelledby="site-seo-heading" className="space-y-4">
          <h3 id="site-seo-heading" className="text-sm font-semibold text-content">
            Search results
          </h3>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="site-seo-title">Page title</Label>
              <CharacterCount value={seoTitle} max={SEO_TITLE_MAX_LENGTH} />
            </div>
            <Input
              id="site-seo-title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              readOnly={update.isPending}
              placeholder={`${community.name} — Community Portal`}
            />
            <p className="text-sm text-content-tertiary">
              Shown as the headline in search results and browser tabs. Leave blank to use your
              community name.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="site-seo-description">Description</Label>
              <CharacterCount value={seoDescription} max={SEO_DESCRIPTION_MAX_LENGTH} />
            </div>
            <Textarea
              id="site-seo-description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              readOnly={update.isPending}
              rows={3}
            />
            <p className="text-sm text-content-tertiary">
              The couple of lines under your title in search results.
            </p>
          </div>

          <SerpPreview settings={previewSettings} community={community} tagline={tagline} />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="site-search-indexing">Let search engines list this site</Label>
              <p className="text-sm text-content-tertiary">
                Turn this off to ask Google and others to leave your site out of search results.
                Your site stays online and anyone with the address can still visit it. Search
                engines can take a few days to catch up.
              </p>
            </div>
            <Switch
              id="site-search-indexing"
              checked={searchIndexing}
              onCheckedChange={setSearchIndexing}
              disabled={update.isPending}
            />
          </div>
        </section>
      ) : (
        <section aria-labelledby="site-footer-heading" className="space-y-4">
          <h3 id="site-footer-heading" className="text-sm font-semibold text-content">
            Footer
          </h3>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="site-association-name">Association name</Label>
              <CharacterCount
                value={associationName}
                max={FOOTER_ASSOCIATION_NAME_MAX_LENGTH}
              />
            </div>
            <Input
              id="site-association-name"
              value={associationName}
              onChange={(e) => setAssociationName(e.target.value)}
              readOnly={update.isPending}
              placeholder={community.name}
            />
            <p className="text-sm text-content-tertiary">
              Used in the copyright line. Leave blank to use your community name.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="site-footer-note">Footer note</Label>
              <CharacterCount value={note} max={FOOTER_NOTE_MAX_LENGTH} />
            </div>
            <Textarea
              id="site-footer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              readOnly={update.isPending}
              rows={2}
            />
            <p className="text-sm text-content-tertiary">
              An extra line under the copyright — your management company, for example.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="site-statutory-line">Show the records statement</Label>
                <p className="text-sm text-content-tertiary">
                  Adds this line to your footer:{' '}
                  <span className="text-content">&ldquo;{STATUTORY_FOOTER_LINE}&rdquo;</span>
                </p>
              </div>
              <Switch
                id="site-statutory-line"
                checked={showStatutoryLine}
                onCheckedChange={setShowStatutoryLine}
                disabled={update.isPending}
              />
            </div>

            {/*
              Always visible, never dismissible, and shown whether or not the
              toggle is on — a manager should read it BEFORE deciding, not after.

              PropertyPro presents factual data and does not assess compliance
              adequacy (.claude/rules/florida-compliance.md). This line is the
              association's statement about itself, so the warning has to make the
              ownership of that claim unmistakable. See the gap analysis §5: this
              is a compliance constraint, not copy that can be tightened for tone.
            */}
            <AlertBanner
              status="warning"
              title="Your association is responsible for this statement."
              description="PropertyPro doesn't verify how your records are kept. Check with your association's attorney before turning this on."
            />
          </div>
        </section>
      )}

      <div className="space-y-2 border-t border-edge pt-4">
        <Button type="submit" disabled={update.isPending || overLimit}>
          {update.isPending ? 'Saving…' : part === 'search' ? 'Save search settings' : 'Save footer'}
        </Button>
        <p className="text-sm text-content-tertiary">
          These go live on your website right away — they aren&apos;t part of Publish.
        </p>
      </div>
    </form>
  );
}

/**
 * The browser-tab icon. Saves the moment a file is picked, like every image
 * upload in the editor; the finalize route records it in branding itself.
 */
export function SiteIconField({
  communityId,
  initialSettings,
}: {
  communityId: number;
  initialSettings?: SiteSettingsRecord;
}) {
  const { data: record } = useSiteSettings(communityId, initialSettings);
  const uploadFavicon = useUploadFavicon(communityId);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset the input so picking the same file twice still fires a change.
      event.target.value = '';
      if (!file) return;
      setError(null);
      uploadFavicon.mutate(file, {
        onSuccess: () => toast.success('Site icon updated.'),
        onError: (err) => setError(err.message),
      });
    },
    [uploadFavicon],
  );

  const favicon = record?.settings.favicon ?? null;
  return (
    <div className="space-y-2">
      {error ? <AlertBanner status="danger" title={error} /> : null}
      <Label htmlFor="site-favicon">Site icon</Label>
      <div className="flex items-center gap-3">
        {favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={buildPublicAssetUrl(favicon.icon32Path)}
            alt=""
            width={32}
            height={32}
            className="rounded-[var(--radius-sm)] border border-edge"
          />
        ) : null}
        <Input
          id="site-favicon"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleChange}
          disabled={uploadFavicon.isPending}
        />
      </div>
      <p className="text-sm text-content-tertiary">
        The small square image shown in browser tabs. PNG or JPEG, square works best. It goes
        live as soon as it uploads.
      </p>
    </div>
  );
}

/**
 * The image shown when someone shares a link to the site (builder v4,
 * Phase 5). Saved on pick and live at once, like the site icon. Cropped to
 * 1200×630 on the server, so the preview here is drawn at that ratio.
 */
export function ShareImageField({
  communityId,
  initialSettings,
}: {
  communityId: number;
  initialSettings?: SiteSettingsRecord;
}) {
  const { data: record } = useSiteSettings(communityId, initialSettings);
  const upload = useUploadShareImage(communityId);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setError(null);
      upload.mutate(file, {
        onSuccess: () => toast.success('Sharing image updated.'),
        onError: (err) => setError(err.message),
      });
    },
    [upload],
  );

  const shareImage = record?.settings.shareImage ?? null;
  return (
    <section aria-labelledby="site-share-heading" className="space-y-3">
      <h3 id="site-share-heading" className="text-sm font-semibold text-content">
        Sharing image
      </h3>
      <p className="text-sm text-content-tertiary">
        Shows when someone shares a link to your site in a text message, email or social post.
      </p>
      {error ? <AlertBanner status="danger" title={error} /> : null}
      {shareImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={buildPublicAssetUrl(shareImage.path)}
          alt="Your current sharing image"
          className="aspect-[1200/630] w-full max-w-md rounded-[var(--radius-md)] border border-edge object-cover"
        />
      ) : (
        <p className="text-sm text-content-secondary" data-testid="share-image-empty">
          No sharing image yet, so shared links show only your site&apos;s title and description.
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="site-share-image">{shareImage ? 'Replace the image' : 'Add an image'}</Label>
        <Input
          id="site-share-image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleChange}
          disabled={upload.isPending}
        />
        <p className="text-sm text-content-tertiary">
          A wide photo of your community works best. We crop it to 1200 × 630. It goes live as
          soon as it uploads.
        </p>
      </div>
    </section>
  );
}
