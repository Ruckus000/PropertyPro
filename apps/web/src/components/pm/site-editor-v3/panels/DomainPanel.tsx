'use client';

/**
 * The "Address" tool panel — attach a custom hostname to the public site.
 *
 * ## States
 *
 *   gated   → plan does not include it: visible-but-locked upsell
 *   loading → first read in flight (see below)
 *   empty   → no domain set: hostname field + Connect, plus the buy flow
 *   pending → DNS not verified yet: status + records table + Check / Remove
 *   active  → live: status + View site + Remove
 *   error   → provider or verification error: alert + Check / Remove
 *
 * ## Why there is a loading state at all
 *
 * The legacy card took a server-fetched seed, which meant every load of the
 * settings page paid a `getDomain()` round-trip to the domain provider — for a
 * card most PMs scrolled past. This panel is dynamically imported and mounted
 * only when its tab is clicked, so it can fetch on mount instead and keep that
 * cost off the editor's initial load entirely. The trade is one brief skeleton
 * for the PMs who do open it.
 *
 * ## These writes are live-immediate
 *
 * Like the Site and Colours panels, nothing here goes through the draft layer —
 * a connected domain is connected, not staged for Publish.
 *
 * CLIENT-SAFE: the domain hooks only. It must NOT import `custom-domain-service`,
 * the Vercel client, or `@propertypro/db` — any of those pulls server-only code
 * into the bundle.
 */

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { PlanBadge } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { StatusBadge } from '@/components/shared/status-badge';
import {
  useCustomDomain,
  useSetDomain,
  useVerifyDomain,
  useRemoveDomain,
} from '@/hooks/use-custom-domain';
import { DomainFinder } from './DomainFinder';

export interface DomainPanelProps {
  communityId: number;
  /** Pro+ gate. When false the panel is visible-but-locked (upsell). */
  hasSiteCustomDomain: boolean;
}

function Hostname({ value }: { value: string }) {
  return (
    <code className="min-w-0 break-all rounded-[var(--radius-sm)] bg-surface-muted px-2 py-0.5 text-sm text-content">
      {value}
    </code>
  );
}

export function DomainPanel({ communityId, hasSiteCustomDomain }: DomainPanelProps) {
  // Called unconditionally — hooks cannot sit behind the gate below. The query
  // is disabled for gated communities so a locked panel issues no request.
  const { data, isPending, isError, error, refetch } = useCustomDomain(
    communityId,
    undefined,
    { enabled: hasSiteCustomDomain },
  );
  const setDomain = useSetDomain(communityId);
  const verifyDomain = useVerifyDomain(communityId);
  const removeDomain = useRemoveDomain(communityId);

  const [host, setHost] = useState('');

  // --- Gated ---------------------------------------------------------------
  if (!hasSiteCustomDomain) {
    return (
      <div data-testid="tool-panel-domain" className="space-y-4">
        <AlertBanner
          status="info"
          variant="subtle"
          data-testid="custom-domain-upsell"
          title={
            <span className="inline-flex items-center gap-2">
              Using your own web address
              <PlanBadge variant="pro" />
            </span>
          }
          description="Your site is live at its PropertyPro address. Upgrade to Professional to serve it from your association's own domain instead."
        />
        <div className="space-y-2">
          <Label htmlFor="custom-domain-host">Your domain</Label>
          <Input id="custom-domain-host" disabled placeholder="www.yourcommunity.com" />
        </div>
        <Button type="button" disabled>
          Connect
        </Button>
      </div>
    );
  }

  // --- Loading / read failure ----------------------------------------------
  if (isPending) {
    return (
      <div data-testid="custom-domain-loading" className="space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-28" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div data-testid="custom-domain-read-error" className="space-y-4">
        <AlertBanner
          status="danger"
          title="We couldn't check your web address."
          description={error?.message ?? 'Please try again.'}
        />
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const removeButton = (
    <Button
      type="button"
      variant="outline"
      onClick={() => removeDomain.mutate()}
      disabled={removeDomain.isPending}
    >
      {removeDomain.isPending ? 'Removing…' : 'Remove'}
    </Button>
  );

  const checkStatusButton = (
    <Button
      type="button"
      onClick={() => verifyDomain.mutate()}
      disabled={verifyDomain.isPending}
    >
      {verifyDomain.isPending ? 'Checking…' : 'Check status'}
    </Button>
  );

  const mutationError = verifyDomain.error ?? removeDomain.error;

  // --- Empty ---------------------------------------------------------------
  if (data.domain === null) {
    const trimmed = host.trim();
    return (
      <div data-testid="custom-domain-empty" className="space-y-4">
        <p className="text-sm text-content-secondary">
          Point your own web address at this community&rsquo;s website. You&rsquo;ll add one
          record at your registrar, then we&rsquo;ll check it for you.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) setDomain.mutate(trimmed);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="custom-domain-host">Your domain</Label>
            <Input
              id="custom-domain-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={setDomain.isPending}
              placeholder="www.yourcommunity.com"
              spellCheck={false}
            />
          </div>
          {setDomain.error ? (
            <AlertBanner status="danger" title={setDomain.error.message} />
          ) : null}
          <Button type="submit" disabled={setDomain.isPending || !trimmed}>
            {setDomain.isPending ? 'Connecting…' : 'Connect'}
          </Button>
        </form>
        <DomainFinder communityId={communityId} />
      </div>
    );
  }

  // --- Active --------------------------------------------------------------
  if (data.status === 'active') {
    return (
      <div data-testid="custom-domain-active" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="completed" label="Live" />
          <Hostname value={data.domain} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <a href={`https://${data.domain}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              View site
            </a>
          </Button>
          {removeButton}
        </div>
        {removeDomain.error ? (
          <AlertBanner status="danger" title={removeDomain.error.message} />
        ) : null}
      </div>
    );
  }

  // --- Error ---------------------------------------------------------------
  if (data.status === 'error') {
    return (
      <div data-testid="custom-domain-error" className="space-y-4">
        <Hostname value={data.domain} />
        <AlertBanner
          status="danger"
          title="Something went wrong with this address."
          description={data.reason ?? 'Check the record at your registrar, then check again.'}
        />
        <div className="flex flex-wrap items-center gap-2">
          {checkStatusButton}
          {removeButton}
        </div>
        {mutationError ? <AlertBanner status="danger" title={mutationError.message} /> : null}
      </div>
    );
  }

  // --- Pending (the default for status === 'pending') ----------------------
  return (
    <div data-testid="custom-domain-pending" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status="pending" label="Waiting on DNS" />
        <Hostname value={data.domain} />
      </div>

      {data.records.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-content-secondary">
            Add {data.records.length > 1 ? 'these records' : 'this record'} at your registrar,
            then choose Check status.
          </p>
          {/* Scrolls inside itself — the tool panel column is narrow, and a DNS
              value is long enough to push the whole editor sideways. */}
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-edge">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-content-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((record, i) => (
                  <tr key={`${record.type}-${record.name}-${i}`} className="border-t border-edge">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-content">
                      {record.type}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-content">
                      {record.name}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-content">
                      {record.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-content-secondary">
          Add the DNS records at your registrar, then choose Check status.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {checkStatusButton}
        {removeButton}
      </div>
      {mutationError ? <AlertBanner status="danger" title={mutationError.message} /> : null}
    </div>
  );
}
