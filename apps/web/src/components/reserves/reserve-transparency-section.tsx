'use client';

import * as React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { useDeleteReserveAsset, useReserveAssets } from '@/hooks/use-reserve-assets';
import {
  RESERVE_ASSET_CARD_DISCLAIMER,
  RESERVE_RUL_CAPTION,
  RESERVE_TRANSPARENCY_DISCLAIMER,
} from '@/lib/constants/reserve-disclaimers';
import {
  RESERVE_ASSET_CATEGORY_LABELS,
  type ReserveAssetRecord,
  type ReserveAssetRulBand,
} from './types';
import { ReserveAssetFormDialog } from './reserve-asset-form-dialog';

interface ReserveTransparencySectionProps {
  communityId: number;
  /** Admin-tier viewers get the add/edit/remove affordances. */
  canManage: boolean;
}

/**
 * Map a remaining-useful-life band onto a StatusBadge status + label.
 *
 * Status is never conveyed by color alone (design rule): StatusBadge renders an
 * icon and text alongside the color. Labels state the neutral time-remaining
 * fact — never a judgment about condition or adequacy.
 */
function rulBadge(band: ReserveAssetRulBand, yearsRemaining: number): { status: string; label: string } {
  switch (band) {
    case 'past_life':
      return { status: 'overdue', label: 'Past expected life' };
    case 'urgent':
      return {
        status: 'due_soon',
        label: yearsRemaining === 0 ? 'Due this year' : `${yearsRemaining} yr${yearsRemaining === 1 ? '' : 's'} left`,
      };
    case 'aware':
      return { status: 'brand', label: `${yearsRemaining} yrs left` };
    case 'healthy':
      return { status: 'compliant', label: `${yearsRemaining} yrs left` };
  }
}

/** Render integer cents as USD without pulling in a formatting lib. */
function formatCents(cents: number | null): string | null {
  if (cents === null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function ReserveAssetCard({
  asset,
  communityId,
  canManage,
  onEdit,
}: {
  asset: ReserveAssetRecord;
  communityId: number;
  canManage: boolean;
  onEdit: (asset: ReserveAssetRecord) => void;
}) {
  const deleteAsset = useDeleteReserveAsset(communityId);
  const badge = rulBadge(asset.rulBand, asset.yearsRemaining);
  const replacementCost = formatCents(asset.replacementCostCents);
  const currentReserve = formatCents(asset.currentReserveCents);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">{asset.name}</CardTitle>
          <p className="text-sm text-content-tertiary">
            {RESERVE_ASSET_CATEGORY_LABELS[asset.category]} · Installed {asset.yearInstalled} ·{' '}
            {asset.usefulLifeYears}-year expected life
          </p>
        </div>
        <StatusBadge status={badge.status} label={badge.label} subtle />
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2 sm:block">
            <dt className="text-content-tertiary">Expected end of life</dt>
            <dd className="text-content">{asset.endOfLifeYear}</dd>
          </div>
          {replacementCost && (
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-content-tertiary">Replacement cost</dt>
              <dd className="text-content">{replacementCost}</dd>
            </div>
          )}
          {currentReserve && (
            <div className="flex justify-between gap-2 sm:block">
              <dt className="text-content-tertiary">Currently reserved</dt>
              <dd className="text-content">{currentReserve}</dd>
            </div>
          )}
        </dl>
        <p className="text-xs text-content-tertiary">{RESERVE_RUL_CAPTION}</p>

        {asset.notes && <p className="text-sm text-content-secondary">{asset.notes}</p>}

        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(asset)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={deleteAsset.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'Remove this component from the reserve register? Owners will no longer see it here.',
                  )
                ) {
                  deleteAsset.mutate(asset.id);
                }
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </Button>
          </div>
        )}

        {/* Per-card no-assessment hedge travels with the countdown, not just the
            section header. */}
        <p className="text-xs text-content-tertiary">{RESERVE_ASSET_CARD_DISCLAIMER}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Reserve-transparency register section.
 *
 * Owner-first by construction: the transparent register is the primary content
 * for every member, and management controls are additive for admins. Displays
 * FACTUAL DATA ONLY — never an adequacy assessment.
 */
export function ReserveTransparencySection({ communityId, canManage }: ReserveTransparencySectionProps) {
  const { data: assets, isLoading, isError, refetch } = useReserveAssets({ communityId });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ReserveAssetRecord | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (asset: ReserveAssetRecord) => {
    setEditing(asset);
    setDialogOpen(true);
  };

  return (
    <section className="space-y-4" aria-labelledby="reserve-transparency-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="reserve-transparency-heading" className="text-xl font-semibold text-content">
            Reserve Register
          </h2>
          <p className="max-w-2xl text-sm text-content-tertiary">
            {RESERVE_TRANSPARENCY_DISCLAIMER}
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Asset
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {isError && (
        <AlertBanner
          status="danger"
          title="We couldn't load the reserve register"
          description="Please try again."
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {!isLoading && !isError && assets && assets.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              preset={
                canManage ? 'reserve_transparency_empty_admin' : 'reserve_transparency_empty_resident'
              }
              action={
                canManage ? (
                  <Button onClick={openCreate} size="sm">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Asset
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && assets && assets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {assets.map((asset) => (
            <ReserveAssetCard
              key={asset.id}
              asset={asset}
              communityId={communityId}
              canManage={canManage}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      {canManage && (
        <ReserveAssetFormDialog
          communityId={communityId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </section>
  );
}
