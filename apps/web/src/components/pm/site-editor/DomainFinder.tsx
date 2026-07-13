'use client';

/**
 * Guided domain purchase — collapsed disclosure inside CustomDomainCard's
 * EMPTY state only ("Don't have a domain yet?"). Checks availability + an
 * indicative price via GET /api/v1/pm/site/domain/check, then links out to
 * registrars to buy. The app never registers or bills for domains; after
 * buying, the PM returns to the connect form directly above this component.
 *
 * CLIENT-SAFE: imports only the use-custom-domain hook and lucide icons —
 * no server-only code.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useCheckDomainAvailability } from '@/hooks/use-custom-domain';

interface DomainFinderProps {
  communityId: number;
}

const REGISTRARS = [
  {
    name: 'Namecheap',
    searchUrl: (domain: string) =>
      `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`,
  },
  {
    name: 'Porkbun',
    searchUrl: (domain: string) =>
      `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`,
  },
] as const;

export function DomainFinder({ communityId }: DomainFinderProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const check = useCheckDomainAvailability(communityId);

  const trimmed = name.trim();
  const result = check.data;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div data-testid="domain-finder" className="rounded-md border border-default">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="domain-finder-toggle"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-content hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        <Chevron className="h-4 w-4 shrink-0 text-content-secondary" aria-hidden="true" />
        Don&rsquo;t have a domain yet? Find one
      </button>
      {open && (
        <div className="space-y-3 border-t border-default px-4 py-4">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (trimmed) check.mutate(trimmed);
            }}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor="domain-finder-name" className="block text-sm font-medium text-content">
                Domain to check
              </label>
              <input
                id="domain-finder-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={check.isPending}
                placeholder="yourcommunity.com"
                className="w-full rounded-sm border border-default px-3 py-2 text-base focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={check.isPending || !trimmed}
              className="inline-flex items-center rounded-md border border-default bg-surface-card px-4 py-2 text-sm font-medium text-content disabled:opacity-50 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
            >
              {check.isPending ? 'Checking…' : 'Check availability'}
            </button>
          </form>

          {check.error && (
            <div
              role="alert"
              className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
            >
              {check.error.message}
            </div>
          )}

          {result && !result.available && (
            <p data-testid="domain-finder-taken" className="text-sm text-content-secondary">
              <code className="rounded bg-surface-muted px-1.5 py-0.5 text-content">{result.name}</code>{' '}
              is already registered. Already own it? Enter it above to connect it.
            </p>
          )}

          {result && result.available && (
            <div data-testid="domain-finder-available" className="space-y-2">
              <p className="text-sm text-content">
                <code className="rounded bg-surface-muted px-1.5 py-0.5">{result.name}</code> looks
                available
                {result.price != null && (
                  <>
                    {' '}
                    — from ~${result.price}
                    {result.period != null && result.period > 1
                      ? ` / ${result.period} yr`
                      : '/yr'}{' '}
                    <span className="text-content-secondary">
                      (final price set by the registrar)
                    </span>
                  </>
                )}
                .
              </p>
              <div className="flex flex-wrap gap-2">
                {REGISTRARS.map((r) => (
                  <a
                    key={r.name}
                    href={r.searchUrl(result.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center rounded-md border border-default bg-surface-card px-3 py-1.5 text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Buy at {r.name}
                  </a>
                ))}
              </div>
              <p className="text-sm text-content-secondary">
                After you buy it, come back and enter it above to connect it.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
