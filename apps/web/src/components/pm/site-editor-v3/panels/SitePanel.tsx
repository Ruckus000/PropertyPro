'use client';

/**
 * The "Site" tool panel — SEO settings and the public-site footer.
 *
 * ## These writes are live-immediate, and the copy says so
 *
 * Everything here lands in `communities.branding`, which is outside the draft
 * layer: the publish flow promotes `site_blocks` rows only. So Save is public
 * on the next request, exactly like the community's colours and web address
 * already are. That is stated next to the button rather than in a toast
 * afterwards.
 *
 * ## Why Save is explicit rather than autosaved
 *
 * Two of these fields are public-facing and one of them carries a counsel
 * warning. An 800 ms debounce publishing a half-typed statutory attestation is
 * the wrong default, whatever the rest of the editor does.
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
} from '@/lib/site-editor/site-settings';
import {
  useSiteSettings,
  useUpdateSiteSettings,
  useUploadFavicon,
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
  /** Server-rendered initial state, so the panel is usable on first paint. */
  initialSettings?: SiteSettingsRecord;
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

export function SitePanel({
  communityId,
  community,
  tagline,
  initialSettings,
}: SitePanelProps) {
  const { data: record } = useSiteSettings(communityId, initialSettings);
  const update = useUpdateSiteSettings(communityId);
  const uploadFavicon = useUploadFavicon(communityId);

  const [seoTitle, setSeoTitle] = useState(record?.settings.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(record?.settings.seoDescription ?? '');
  const [searchIndexing, setSearchIndexing] = useState(record?.settings.searchIndexing ?? true);
  const [associationName, setAssociationName] = useState(record?.footer.associationName ?? '');
  const [note, setNote] = useState(record?.footer.note ?? '');
  const [showStatutoryLine, setShowStatutoryLine] = useState(
    record?.footer.showStatutoryLine ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  // Resync when the STORED record actually changes.
  //
  // `useState(props.x)` never resyncs on its own, and these are public-facing
  // writes — a background refetch must not silently clobber someone mid-edit.
  // Keying on CONTENT rather than object identity means a refetch returning the
  // same values leaves the form alone; only a real change (another manager
  // saved, or this tab's own save landed) rewrites it, and then showing the
  // truth is the point.
  const storedKey = record
    ? JSON.stringify([record.settings, record.footer])
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

  const overLimit =
    countCharacters(seoTitle) > SEO_TITLE_MAX_LENGTH ||
    countCharacters(seoDescription) > SEO_DESCRIPTION_MAX_LENGTH ||
    countCharacters(associationName) > FOOTER_ASSOCIATION_NAME_MAX_LENGTH ||
    countCharacters(note) > FOOTER_NOTE_MAX_LENGTH;

  // The preview renders the values being typed, through the same resolvers the
  // real page uses.
  const previewSettings = useMemo(
    () => ({
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      searchIndexing,
      favicon: record?.settings.favicon ?? null,
    }),
    [seoTitle, seoDescription, searchIndexing, record?.settings.favicon],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      if (overLimit) {
        setError('One of these is too long. Shorten it and try again.');
        return;
      }

      update.mutate(
        {
          // Empty means "clear it", which is a real choice here — unlike the
          // urgent notice, where empty is an error.
          seoTitle: seoTitle.trim() || null,
          seoDescription: seoDescription.trim() || null,
          searchIndexing,
          associationName: associationName.trim() || null,
          note: note.trim() || null,
          showStatutoryLine,
        },
        {
          onSuccess: () => toast.success('Site settings saved. Your website is updated.'),
          onError: (err) => setError(err.message),
        },
      );
    },
    [
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

  const handleFaviconChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset the input so picking the same file twice still fires a change.
      event.target.value = '';
      if (!file) return;
      uploadFavicon.mutate(file, {
        onSuccess: () => toast.success('Favicon updated.'),
        onError: (err) => setError(err.message),
      });
    },
    [uploadFavicon],
  );

  const favicon = record?.settings.favicon ?? null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error ? <AlertBanner status="danger" title={error} /> : null}

      <section aria-labelledby="site-seo-heading" className="space-y-4">
        <h3 id="site-seo-heading" className="text-sm font-semibold text-content">
          Search &amp; sharing
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
          />
        </div>

        <div className="space-y-2">
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
              onChange={handleFaviconChange}
              disabled={uploadFavicon.isPending}
            />
          </div>
          <p className="text-sm text-content-tertiary">
            The small square image shown in browser tabs. PNG or JPEG, square works best.
          </p>
        </div>
      </section>

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

      <div className="space-y-2 border-t border-edge pt-4">
        <Button type="submit" disabled={update.isPending || overLimit}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        <p className="text-sm text-content-tertiary">
          These go live on your website right away — they aren&apos;t part of Publish.
        </p>
      </div>
    </form>
  );
}
