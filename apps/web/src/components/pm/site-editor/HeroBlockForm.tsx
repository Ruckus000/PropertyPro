'use client';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { HeroBlockContent } from '@propertypro/shared';
import { useUpdateHeroBlock } from '@/hooks/use-hero-block';

interface Props {
  communityId: number;
  initial: HeroBlockContent | null;
}

export function HeroBlockForm({ communityId, initial }: Props) {
  const [headline, setHeadline] = useState(initial?.headline ?? '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '');
  const [ctaText, setCtaText] = useState(initial?.ctaText ?? '');
  const [ctaTarget, setCtaTarget] = useState(initial?.ctaTarget ?? '');
  const [serverError, setServerError] = useState<string | null>(null);
  const mutation = useUpdateHeroBlock(communityId);

  const disabled = headline.trim().length === 0 || mutation.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const payload: HeroBlockContent = {
      headline: headline.trim(),
      ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
      ...(ctaText.trim() ? { ctaText: ctaText.trim() } : {}),
      ...(ctaTarget.trim() ? { ctaTarget: ctaTarget.trim() } : {}),
      ...(initial?.heroImagePath ? { heroImagePath: initial.heroImagePath } : {}),
      ...(initial?.heroImageAlt ? { heroImageAlt: initial.heroImageAlt } : {}),
    } as HeroBlockContent;
    try {
      await mutation.mutateAsync(payload);
      toast.success('Welcome section saved.');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Save failed.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      <div>
        <label htmlFor="hero-headline" className="block text-sm font-medium text-content">
          Headline <span className="text-danger">*</span>
        </label>
        <input
          id="hero-headline"
          name="headline"
          type="text"
          maxLength={120}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          required
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive"
        />
      </div>
      <div>
        <label htmlFor="hero-subtitle" className="block text-sm font-medium text-content">Subtitle</label>
        <textarea
          id="hero-subtitle"
          name="subtitle"
          maxLength={280}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="hero-cta-text" className="block text-sm font-medium text-content">CTA text</label>
          <input
            id="hero-cta-text"
            name="ctaText"
            type="text"
            maxLength={40}
            value={ctaText}
            onChange={(e) => setCtaText(e.target.value)}
            className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive"
          />
        </div>
        <div>
          <label htmlFor="hero-cta-target" className="block text-sm font-medium text-content">CTA target</label>
          <input
            id="hero-cta-target"
            name="ctaTarget"
            type="text"
            maxLength={512}
            placeholder="/auth/login"
            value={ctaTarget}
            onChange={(e) => setCtaTarget(e.target.value)}
            className="mt-1 block w-full rounded-sm border border-default px-3 py-2 focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive"
          />
        </div>
      </div>

      {serverError && (
        <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
          {serverError}
        </div>
      )}

      <div className="pt-2">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 disabled:cursor-not-allowed hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
