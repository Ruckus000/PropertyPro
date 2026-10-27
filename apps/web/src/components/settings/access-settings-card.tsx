'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsCard, SettingsRow } from '@/components/settings/settings-layout';
import { useAccessSettings, useUpdateAccessSettings } from '@/hooks/use-access-settings';

interface Props {
  communityId: number;
}

/**
 * Whether tenants can open Inspection Reports. Condo and HOA only. The page's
 * "Tenant access" section supplies the title and description.
 */
export function AccessSettingsCard({ communityId }: Props) {
  const { data, isLoading, isError } = useAccessSettings(communityId);
  const update = useUpdateAccessSettings(communityId);

  return (
    <SettingsCard>
      {isError ? (
        <p className="px-5 py-4 text-sm text-status-danger">Couldn’t load this setting. Refresh to try again.</p>
      ) : isLoading || !data ? (
        <div className="px-5 py-4">
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <SettingsRow
          inlineControl
          label={
            <Label htmlFor="tenants-inspection-reports" className="text-base">
              Tenants can view inspection reports
            </Label>
          }
          description={
            <>
              Includes milestone inspections and the structural integrity reserve study (SIRS).
              Florida law reserves these records for owners; turn on only if your association has
              decided to share them.
            </>
          }
          control={
            <Switch
              id="tenants-inspection-reports"
              checked={data.tenantsCanViewInspectionReports}
              disabled={update.isPending}
              onCheckedChange={(v) => update.mutate({ tenantsCanViewInspectionReports: v })}
            />
          }
        >
          {update.isError && <p className="text-sm text-status-danger">That change didn’t save. Try again.</p>}
        </SettingsRow>
      )}
    </SettingsCard>
  );
}
