'use client';

/**
 * The Design tool's Logos section: the square logo and the site logo
 * (wordmark).
 *
 * Unlike everything else in the Design tool, logos are LIVE as soon as they
 * save: they are not part of the drafted look (`SITE_LOOK_FIELDS`), and they
 * are used outside the website too (sign-in pages, emails). The copy says so.
 *
 * Upload is two steps: the raw file goes to storage (`useUploadLogo`), then
 * its path goes to `PATCH /api/v1/pm/branding`, which resizes it and keeps its
 * own copy.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useLiveBranding, useSaveLiveBranding } from '@/hooks/use-live-branding';
import { useUploadLogo } from '@/hooks/use-upload-logo';

type LogoKind = 'logo' | 'siteLogo';

const COPY: Record<LogoKind, { label: string; help: string; field: 'logoStoragePath' | 'siteLogoStoragePath' }> = {
  logo: {
    label: 'Square logo',
    help: 'Shown on sign-in pages and in your site header when there is no site logo. We crop it to a square.',
    field: 'logoStoragePath',
  },
  siteLogo: {
    label: 'Site logo',
    help: "Shown in your website's header. A wide logo works best; we keep its shape.",
    field: 'siteLogoStoragePath',
  },
};

function LogoField({ communityId, kind, url }: { communityId: number; kind: LogoKind; url: string | null }) {
  const upload = useUploadLogo();
  const save = useSaveLiveBranding(communityId);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];
  const busy = upload.isPending || save.isPending;
  const inputId = `design-${kind}-file`;

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset the input so picking the same file twice still fires a change.
      event.target.value = '';
      if (!file) return;
      setError(null);
      try {
        const path = await upload.mutateAsync({ communityId, file });
        await save.mutateAsync({ [copy.field]: path });
        toast.success(`${copy.label} updated on your website.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That upload did not work. Try again.');
      }
    },
    [communityId, copy, upload, save],
  );

  function remove() {
    setError(null);
    save.mutate(
      { [copy.field]: null },
      {
        onSuccess: () => toast.success(`${copy.label} removed from your website.`),
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <div className="space-y-2" data-testid={`design-${kind}`}>
      <Label htmlFor={inputId}>{copy.label}</Label>
      {error ? <AlertBanner status="danger" title={error} /> : null}
      <div className="flex items-center gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Your current ${copy.label.toLowerCase()}`}
            className={`rounded-[var(--radius-sm)] border border-edge bg-surface-card object-contain ${
              kind === 'logo' ? 'h-12 w-12' : 'h-12 max-w-48'
            }`}
          />
        ) : (
          <span className="text-sm text-content-secondary">None yet</span>
        )}
        {url ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove}>
            Remove
          </Button>
        ) : null}
      </div>
      <Input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void handleChange(e)}
        disabled={busy}
      />
      <p className="text-sm text-content-tertiary">{copy.help} PNG, JPEG or WebP.</p>
    </div>
  );
}

export function LogosSection({ communityId }: { communityId: number }) {
  const branding = useLiveBranding(communityId);

  return (
    <section aria-labelledby="design-logos-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="design-logos-heading" className="text-sm font-semibold text-content">
          Logos
        </h3>
        <span className="text-xs text-content-tertiary">Live right away</span>
      </div>
      <p className="text-sm text-content-secondary">
        Logos don&apos;t wait for Publish: a new logo shows on your website as soon as it uploads.
      </p>
      {branding.isError ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="Couldn't load your logos"
          action={
            <Button variant="outline" size="sm" onClick={() => void branding.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !branding.data ? (
        <div role="status" aria-label="Loading logos" className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <div className="space-y-6">
          <LogoField communityId={communityId} kind="siteLogo" url={branding.data.siteLogoUrl} />
          <LogoField communityId={communityId} kind="logo" url={branding.data.logoUrl} />
        </div>
      )}
    </section>
  );
}
