'use client';

/**
 * PM Portfolio Templates manager (PT-PR6). Save a community's brand as a
 * template, list/rename/delete templates, and bulk-apply a template across the
 * communities you manage (one-time push with an explicit confirm + per-community
 * result reporting — branding is live the instant it is applied).
 *
 * Client component: talks to the API via the use-portfolio-templates hooks only.
 */
import { useState } from 'react';
import { AlertCircle, CheckCircle2, LayoutTemplate } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  usePortfolioTemplates,
  useCreateTemplate,
  useRenameTemplate,
  useDeleteTemplate,
  useApplyTemplate,
  type ApplyResult,
} from '@/hooks/use-portfolio-templates';

interface CommunityOption {
  communityId: number;
  name: string;
}

interface Props {
  hasAccess: boolean;
  communities: CommunityOption[];
}

const PRIMARY_BTN =
  'inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive';
const SECONDARY_BTN =
  'inline-flex items-center rounded-md border border-default bg-surface-card px-4 py-2 text-sm font-medium text-content disabled:opacity-50 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive';
const INPUT =
  'w-full rounded-sm border border-default bg-surface-card px-3 py-2 text-base text-content focus:outline-none focus:ring-2 focus:ring-interactive/40';
const SECTION = 'rounded-md border border-default bg-surface-card p-6 shadow-e0';

function InlineAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">
      {children}
    </div>
  );
}

export function PortfolioTemplatesManager({ hasAccess, communities }: Props) {
  if (!hasAccess) {
    return (
      <section data-testid="portfolio-upsell" className={SECTION}>
        <h2 className="flex items-center gap-2 text-lg font-medium text-content">
          <LayoutTemplate aria-hidden="true" className="h-5 w-5" />
          Portfolio Templates (Operations Plus)
        </h2>
        <p className="mt-2 text-sm text-content-secondary">
          Save a community&rsquo;s brand and apply it across your whole portfolio in one action.
          Upgrade to the Operations Plus plan to unlock portfolio templates.
        </p>
      </section>
    );
  }
  return <ManagerBody communities={communities} />;
}

function ManagerBody({ communities }: { communities: CommunityOption[] }) {
  const templatesQuery = usePortfolioTemplates();
  const create = useCreateTemplate();
  const rename = useRenameTemplate();
  const del = useDeleteTemplate();
  const apply = useApplyTemplate();

  const [createName, setCreateName] = useState('');
  const [createCommunityId, setCreateCommunityId] = useState<number | ''>(
    communities[0]?.communityId ?? '',
  );

  const [renameId, setRenameId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [applyId, setApplyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [results, setResults] = useState<ApplyResult[] | null>(null);

  const canSave = createName.trim().length > 0 && createCommunityId !== '';

  function onSave() {
    // `canSave` includes `createCommunityId !== ''`, so this guard narrows it to number.
    if (!canSave) return;
    create.mutate(
      { communityId: createCommunityId, name: createName.trim() },
      { onSuccess: () => setCreateName('') },
    );
  }

  function toggleTarget(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openApply(id: number) {
    setApplyId(id);
    setSelected(new Set());
    setConfirming(false);
    setResults(null);
  }

  function onApply() {
    if (applyId === null || selected.size === 0) return;
    apply.mutate(
      { id: applyId, communityIds: Array.from(selected) },
      { onSuccess: (r) => setResults(r) },
    );
  }

  return (
    <div className="space-y-6">
      {/* Save as template */}
      <section className={SECTION}>
        <h2 className="text-lg font-medium text-content">Save a community&rsquo;s brand as a template</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content">Source community</span>
            <select
              data-testid="create-community"
              className={INPUT}
              value={createCommunityId}
              onChange={(e) => setCreateCommunityId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              {communities.length === 0 && <option value="">No managed communities</option>}
              {communities.map((c) => (
                <option key={c.communityId} value={c.communityId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-content">Template name</span>
            <input
              data-testid="create-name"
              className={INPUT}
              value={createName}
              maxLength={100}
              placeholder="e.g. Coastal Brand"
              onChange={(e) => setCreateName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className={PRIMARY_BTN}
            disabled={!canSave || create.isPending}
            onClick={onSave}
          >
            {create.isPending ? 'Saving…' : 'Save as template'}
          </button>
        </div>
        {create.isError && <div className="mt-3"><InlineAlert>{create.error.message}</InlineAlert></div>}
      </section>

      {/* Template library */}
      <section className={SECTION}>
        <h2 className="text-lg font-medium text-content">Your templates</h2>

        {templatesQuery.isLoading && (
          <div className="mt-4 space-y-2" aria-hidden="true">
            <div className="h-12 animate-pulse rounded-md bg-surface-muted" />
            <div className="h-12 animate-pulse rounded-md bg-surface-muted" />
          </div>
        )}

        {templatesQuery.isError && (
          <div className="mt-4">
            <InlineAlert>We couldn&rsquo;t load your templates. Please try again.</InlineAlert>
          </div>
        )}

        {templatesQuery.data && templatesQuery.data.length === 0 && (
          <p data-testid="templates-empty" className="mt-4 text-sm text-content-secondary">
            No templates yet. Save a community&rsquo;s brand above to create your first one.
          </p>
        )}

        {templatesQuery.data && templatesQuery.data.length > 0 && (
          <ul data-testid="templates-list" className="mt-4 divide-y divide-default">
            {templatesQuery.data.map((t) => (
              <li key={t.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  {renameId === t.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        className={INPUT}
                        value={renameValue}
                        maxLength={100}
                        aria-label="New template name"
                        onChange={(e) => setRenameValue(e.target.value)}
                      />
                      <button
                        type="button"
                        className={PRIMARY_BTN}
                        disabled={rename.isPending || renameValue.trim().length === 0}
                        onClick={() =>
                          rename.mutate(
                            { id: t.id, name: renameValue.trim() },
                            { onSuccess: () => setRenameId(null) },
                          )
                        }
                      >
                        Save
                      </button>
                      <button type="button" className={SECONDARY_BTN} onClick={() => setRenameId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0">
                        <p className="truncate text-base font-medium text-content">{t.name}</p>
                        <p className="text-sm text-content-secondary">
                          {t.siteLogoPath ? 'Includes logo · ' : ''}
                          Created {new Date(t.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button type="button" className={SECONDARY_BTN} onClick={() => openApply(t.id)}>
                          Apply
                        </button>
                        <button
                          type="button"
                          className={SECONDARY_BTN}
                          onClick={() => {
                            setRenameId(t.id);
                            setRenameValue(t.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className={SECONDARY_BTN}
                          disabled={del.isPending}
                          onClick={() => del.mutate(t.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Apply panel for this template */}
                {applyId === t.id && (
                  <div data-testid="apply-panel" className="mt-3 rounded-md border border-default bg-surface p-4">
                    <h3 className="text-sm font-medium text-content">
                      Apply &ldquo;{t.name}&rdquo; to communities
                    </h3>
                    {communities.length === 0 ? (
                      <p className="mt-2 text-sm text-content-secondary">No managed communities.</p>
                    ) : (
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        {communities.map((c) => (
                          <label key={c.communityId} className="flex items-center gap-2 text-sm text-content">
                            <input
                              type="checkbox"
                              checked={selected.has(c.communityId)}
                              onChange={() => toggleTarget(c.communityId)}
                            />
                            {c.name}
                          </label>
                        ))}
                      </div>
                    )}

                    {!confirming ? (
                      <button
                        type="button"
                        className={cn(PRIMARY_BTN, 'mt-3')}
                        disabled={selected.size === 0}
                        onClick={() => setConfirming(true)}
                      >
                        Apply to {selected.size} {selected.size === 1 ? 'community' : 'communities'}
                      </button>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-content-secondary">
                          This replaces the colors, fonts, layout, theme, tagline, and logo on the{' '}
                          <strong className="font-medium text-content">live sites</strong> of{' '}
                          {selected.size} {selected.size === 1 ? 'community' : 'communities'}.
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className={PRIMARY_BTN}
                            disabled={apply.isPending}
                            onClick={onApply}
                          >
                            {apply.isPending ? 'Applying…' : 'Confirm — replace branding'}
                          </button>
                          <button
                            type="button"
                            className={SECONDARY_BTN}
                            onClick={() => setConfirming(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {apply.isError && <div className="mt-2"><InlineAlert>{apply.error.message}</InlineAlert></div>}

                    {results && (
                      <ul data-testid="apply-results" className="mt-3 space-y-1">
                        {results.map((r) => (
                          <li
                            key={r.communityId}
                            className={cn(
                              'flex items-center gap-2 rounded-sm px-2 py-1 text-sm',
                              r.status === 'applied'
                                ? 'bg-success/10 text-success-strong'
                                : 'bg-danger/10 text-danger',
                            )}
                          >
                            {r.status === 'applied' ? (
                              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                            ) : (
                              <AlertCircle aria-hidden="true" className="h-4 w-4" />
                            )}
                            <span>
                              {r.communityName} — {r.status === 'applied' ? 'Applied' : `Failed${r.reason ? `: ${r.reason}` : ''}`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-3">
                      <button
                        type="button"
                        className="text-sm text-content-secondary underline hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
                        onClick={() => setApplyId(null)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
