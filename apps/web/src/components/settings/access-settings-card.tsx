'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccessSettings, useUpdateAccessSettings } from '@/hooks/use-access-settings';

interface Props {
  communityId: number;
}

/** Whether tenants can open Inspection Reports. Condo and HOA only. */
export function AccessSettingsCard({ communityId }: Props) {
  const { data, isLoading, isError } = useAccessSettings(communityId);
  const update = useUpdateAccessSettings(communityId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant access</CardTitle>
        <CardDescription>Choose whether tenants can open inspection reports. Owners always can.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isError ? (
          <p className="text-sm text-status-danger">Couldn’t load this setting. Refresh to try again.</p>
        ) : isLoading || !data ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="tenants-inspection-reports">Tenants can view inspection reports</Label>
                <p className="text-sm text-content-tertiary">
                  Includes milestone inspections and the structural integrity reserve study (SIRS).
                  Florida law reserves these records for owners; turn on only if your association
                  has decided to share them.
                </p>
              </div>
              <Switch
                id="tenants-inspection-reports"
                checked={data.tenantsCanViewInspectionReports}
                disabled={update.isPending}
                onCheckedChange={(v) => update.mutate({ tenantsCanViewInspectionReports: v })}
              />
            </div>
            {update.isError && <p className="text-sm text-status-danger">That change didn’t save. Try again.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
