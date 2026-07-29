'use client';

/**
 * Guided domain purchase — a collapsed disclosure inside the Address panel's
 * EMPTY state only. Checks availability and an indicative price, then links out
 * to registrars.
 *
 * PropertyPro never registers or bills for a domain. After buying, the PM comes
 * back to the connect form directly above this component. The price shown is
 * the provider's indicative figure and is labelled as such, because the
 * registrar sets the real one at checkout.
 *
 * CLIENT-SAFE: the domain hooks and lucide icons only — no `custom-domain-service`,
 * no Vercel client, no `@propertypro/db`. Any of those would drag server-only
 * code into the editor bundle.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertBanner } from '@/components/shared/alert-banner';
import { useCheckDomainAvailability } from '@/hooks/use-custom-domain';

export interface DomainFinderProps {
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
    <div data-testid="domain-finder" className="rounded-[var(--radius-md)] border border-edge">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="domain-finder-toggle"
        className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-4 py-3 text-left text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <Chevron className="h-4 w-4 shrink-0 text-content-secondary" aria-hidden="true" />
        Don&rsquo;t have a domain yet? Find one
      </button>

      {open ? (
        <div className="space-y-3 border-t border-edge px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="domain-finder-name">Domain to check</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="domain-finder-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  // Drop the previous verdict and its registrar links so they
                  // cannot linger beside a now-different domain.
                  if (check.data || check.error) check.reset();
                }}
                disabled={check.isPending}
                placeholder="yourcommunity.com"
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                disabled={check.isPending || !trimmed}
                onClick={() => {
                  if (trimmed) check.mutate(trimmed);
                }}
              >
                {check.isPending ? 'Checking…' : 'Check'}
              </Button>
            </div>
          </div>

          {check.error ? <AlertBanner status="danger" title={check.error.message} /> : null}

          {result && !result.available ? (
            <p data-testid="domain-finder-taken" className="text-sm text-content-secondary">
              <code className="rounded-[var(--radius-sm)] bg-surface-muted px-1.5 py-0.5 text-content">
                {result.name}
              </code>{' '}
              is already registered. Already own it? Enter it above to connect it.
            </p>
          ) : null}

          {result && result.available ? (
            <div data-testid="domain-finder-available" className="space-y-2">
              <p className="text-sm text-content">
                <code className="rounded-[var(--radius-sm)] bg-surface-muted px-1.5 py-0.5">
                  {result.name}
                </code>{' '}
                looks available
                {result.price != null ? (
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
                ) : null}
                .
              </p>
              <div className="flex flex-wrap gap-2">
                {REGISTRARS.map((r) => (
                  <Button key={r.name} asChild variant="outline" size="sm">
                    <a href={r.searchUrl(result.name)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      Buy at {r.name}
                    </a>
                  </Button>
                ))}
              </div>
              <p className="text-sm text-content-tertiary">
                After you buy it, come back and enter it above to connect it.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
