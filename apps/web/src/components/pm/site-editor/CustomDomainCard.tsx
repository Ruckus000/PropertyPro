'use client';

/**
 * PR #6: PM custom-domain card on /pm/settings/website.
 *
 * Lets a Pro+ PM attach a custom hostname to a community's public site, see the
 * DNS records to add, re-check verification status, and remove the domain.
 *
 * State machine (driven by the live DomainState from useCustomDomain):
 *   gated   → feature off: visible-but-disabled upsell
 *   empty   → no domain set: hostname input + "Add domain"
 *   pending → DNS not yet verified: status pill + records table + Check/Remove
 *   active  → live: "Live" pill + View site + Remove
 *   error   → provider/verification error: danger alert + Check/Remove
 *
 * CLIENT-SAFE: imports only the use-custom-domain hooks, design/ui bits, and
 * cn(). It must NOT import custom-domain-service, the Vercel client, or
 * @propertypro/db — any of those would drag server-only code into the bundle.
 */

import { useState } from 'react';
import { CheckCircle2, Clock, AlertCircle, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCustomDomain,
  useSetDomain,
  useVerifyDomain,
  useRemoveDomain,
  type DomainState,
} from '@/hooks/use-custom-domain';
import { DomainFinder } from './DomainFinder';

interface CustomDomainCardProps {
  communityId: number;
  hasSiteCustomDomain: boolean;
  /** Server-fetched seed; records are always [] from getDomain(). */
  initial: DomainState;
}

const primaryButtonClass =
  'inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive';

const secondaryButtonClass =
  'inline-flex items-center rounded-md border border-default bg-surface-card px-4 py-2 text-sm font-medium text-content disabled:opacity-50 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive';

const inputClass =
  'w-full max-w-md rounded-sm border border-default px-3 py-2 text-base focus:border-interactive focus:outline-none focus:ring-2 focus:ring-interactive/40 disabled:opacity-50';

function InlineAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-sm border border-danger bg-danger/10 px-3 py-2 text-sm text-danger"
    >
      {message}
    </div>
  );
}

function StatusPill({
  tone,
  icon: Icon,
  label,
}: {
  tone: 'aware' | 'success';
  icon: typeof Clock;
  label: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium',
        tone === 'aware' && 'bg-warning/10 text-warning-strong',
        tone === 'success' && 'bg-success/10 text-success-strong',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}

export function CustomDomainCard({
  communityId,
  hasSiteCustomDomain,
  initial,
}: CustomDomainCardProps) {
  const { data } = useCustomDomain(communityId, initial);
  const setDomain = useSetDomain(communityId);
  const verifyDomain = useVerifyDomain(communityId);
  const removeDomain = useRemoveDomain(communityId);

  const [host, setHost] = useState('');

  const state = data ?? initial;

  const heading = (
    <h2 className="text-lg font-medium text-content">
      Custom Domain{!hasSiteCustomDomain && ' (Pro)'}
    </h2>
  );

  // --- Gated: visible-but-disabled upsell ----------------------------------
  if (!hasSiteCustomDomain) {
    return (
      <div data-testid="custom-domain-upsell" className="space-y-4">
        {heading}
        <div className="rounded-md border border-default bg-surface-muted px-4 py-3 text-sm text-content-secondary">
          Connecting a custom domain is a{' '}
          <strong className="font-medium text-content">Professional</strong> feature. Upgrade to
          serve your community site from your own hostname.
        </div>
        <div className="space-y-1">
          <label htmlFor="custom-domain-host" className="block text-sm font-medium text-content">
            Custom domain
          </label>
          <input
            id="custom-domain-host"
            type="text"
            disabled
            placeholder="www.yourcommunity.com"
            className={inputClass}
          />
        </div>
        <button type="button" disabled className={primaryButtonClass}>
          Add domain
        </button>
      </div>
    );
  }

  const removeButton = (
    <button
      type="button"
      onClick={() => removeDomain.mutate()}
      disabled={removeDomain.isPending}
      className={secondaryButtonClass}
    >
      {removeDomain.isPending ? 'Removing…' : 'Remove'}
    </button>
  );

  const checkStatusButton = (
    <button
      type="button"
      onClick={() => verifyDomain.mutate()}
      disabled={verifyDomain.isPending}
      className={primaryButtonClass}
    >
      {verifyDomain.isPending ? 'Checking…' : 'Check status'}
    </button>
  );

  // --- Empty: no domain set ------------------------------------------------
  if (state.domain === null) {
    const trimmed = host.trim();
    return (
      <div data-testid="custom-domain-empty" className="space-y-4">
        {heading}
        <p className="text-sm text-content-secondary">
          Point your own hostname at this community&rsquo;s public site. You&rsquo;ll add a DNS
          record at your registrar, then we&rsquo;ll verify it.
        </p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) setDomain.mutate(trimmed);
          }}
        >
          <div className="space-y-1">
            <label htmlFor="custom-domain-host" className="block text-sm font-medium text-content">
              Custom domain
            </label>
            <input
              id="custom-domain-host"
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              disabled={setDomain.isPending}
              placeholder="www.yourcommunity.com"
              className={inputClass}
            />
          </div>
          {setDomain.error && <InlineAlert message={setDomain.error.message} />}
          <button type="submit" disabled={setDomain.isPending || !trimmed} className={primaryButtonClass}>
            {setDomain.isPending ? 'Adding…' : 'Add domain'}
          </button>
        </form>
        {/* Guided purchase — only in the empty state, collapsed by default so
            the connect flow stays uncluttered. */}
        <DomainFinder communityId={communityId} />
      </div>
    );
  }

  // --- Active --------------------------------------------------------------
  if (state.status === 'active') {
    return (
      <div data-testid="custom-domain-active" className="space-y-4">
        {heading}
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone="success" icon={CheckCircle2} label="Live" />
          <code className="rounded bg-surface-muted px-2 py-0.5 text-sm text-content">
            {state.domain}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`https://${state.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className={secondaryButtonClass}
          >
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            View site
          </a>
          {removeButton}
        </div>
        {removeDomain.error && <InlineAlert message={removeDomain.error.message} />}
      </div>
    );
  }

  // --- Error ---------------------------------------------------------------
  if (state.status === 'error') {
    return (
      <div data-testid="custom-domain-error" className="space-y-4">
        {heading}
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded bg-surface-muted px-2 py-0.5 text-sm text-content">
            {state.domain}
          </code>
        </div>
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{state.reason ?? 'Something went wrong with this domain.'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {checkStatusButton}
          {removeButton}
        </div>
        {(verifyDomain.error || removeDomain.error) && (
          <InlineAlert message={(verifyDomain.error ?? removeDomain.error)!.message} />
        )}
      </div>
    );
  }

  // --- Pending (default for status === 'pending') --------------------------
  return (
    <div data-testid="custom-domain-pending" className="space-y-4">
      {heading}
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill tone="aware" icon={Clock} label="Pending DNS" />
        <code className="rounded bg-surface-muted px-2 py-0.5 text-sm text-content">
          {state.domain}
        </code>
      </div>
      {state.records.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-content-secondary">
            Add the following DNS record{state.records.length > 1 ? 's' : ''} at your registrar, then
            click Check status.
          </p>
          <div className="overflow-x-auto rounded-md border border-default">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted text-content-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {state.records.map((record, i) => (
                  <tr key={`${record.type}-${record.name}-${i}`} className="border-t border-default">
                    <td className="px-3 py-2 font-mono text-content">{record.type}</td>
                    <td className="px-3 py-2 font-mono text-content">{record.name}</td>
                    <td className="px-3 py-2 font-mono text-content">{record.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-content-secondary">
          Add the DNS records at your registrar, then click Check status.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {checkStatusButton}
        {removeButton}
      </div>
      {(verifyDomain.error || removeDomain.error) && (
        <InlineAlert message={(verifyDomain.error ?? removeDomain.error)!.message} />
      )}
    </div>
  );
}
