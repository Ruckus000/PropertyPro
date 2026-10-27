'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsCard, SettingsCardHeader, SettingsRow } from '@/components/settings/settings-layout';
import {
  useSetSnowbirdCadence,
  useSetSnowbirdCommunityEnabled,
  useSnowbirdDigest,
  type SnowbirdCadence,
} from '@/hooks/use-snowbird-digest';

interface Props {
  communityId: number;
  /** Admin-tier viewers get the board enable/disable toggle. */
  canManage: boolean;
}

/**
 * Snowbird digest preferences — a member picks how often they receive the
 * community recap (or turns it off); an admin enables it for the community.
 * Owners are subscribed weekly by default once the board enables it.
 */
export function SnowbirdDigestCard({ communityId, canManage }: Props) {
  const { data, isLoading } = useSnowbirdDigest(communityId);
  const setCadence = useSetSnowbirdCadence(communityId);
  const setEnabled = useSetSnowbirdCommunityEnabled(communityId);

  return (
    <SettingsCard>
      <SettingsCardHeader
        title="Community digest"
        description={
          <>
            An occasional email recap of board decisions, new documents, and upcoming deadlines —
            handy if you&apos;re away from the community.
          </>
        }
      />
      {isLoading || !data ? (
        <div className="px-5 py-4">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {canManage && (
            <SettingsRow
              inlineControl
              label={<Label htmlFor="snowbird-enabled" className="text-base">Send the digest to owners</Label>}
              description="When on, owners receive it weekly by default and can change their own cadence."
              control={
                <Switch
                  id="snowbird-enabled"
                  checked={data.communityEnabled}
                  disabled={setEnabled.isPending}
                  onCheckedChange={(v) => setEnabled.mutate(v)}
                />
              }
            />
          )}

          {data.communityEnabled ? (
            <SettingsRow
              label={<Label htmlFor="snowbird-cadence" className="text-base">How often you receive it</Label>}
              description="Saved as soon as you choose."
              control={
                <Select
                  value={data.cadence}
                  onValueChange={(v) => setCadence.mutate(v as SnowbirdCadence)}
                >
                  <SelectTrigger id="snowbird-cadence" className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          ) : (
            <p className="px-5 py-4 text-sm text-content-secondary">
              {canManage
                ? 'Turn the digest on above to let owners receive it.'
                : "The community digest isn't turned on yet."}
            </p>
          )}
        </>
      )}
    </SettingsCard>
  );
}
