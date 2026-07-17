'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle>Community digest</CardTitle>
        <CardDescription>
          An occasional email recap of board decisions, new documents, and upcoming deadlines — handy
          if you&apos;re away from the community.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading || !data ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            {canManage && (
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="snowbird-enabled">Send the digest to owners</Label>
                  <p className="text-sm text-content-tertiary">
                    When on, owners receive it weekly by default and can change their own cadence.
                  </p>
                </div>
                <Switch
                  id="snowbird-enabled"
                  checked={data.communityEnabled}
                  disabled={setEnabled.isPending}
                  onCheckedChange={(v) => setEnabled.mutate(v)}
                />
              </div>
            )}

            {data.communityEnabled ? (
              <div className="space-y-2">
                <Label htmlFor="snowbird-cadence">How often you receive it</Label>
                <Select
                  value={data.cadence}
                  onValueChange={(v) => setCadence.mutate(v as SnowbirdCadence)}
                >
                  <SelectTrigger id="snowbird-cadence" className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="off">Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-content-tertiary">
                {canManage
                  ? 'Turn the digest on above to let owners receive it.'
                  : "Your board hasn't turned on the community digest yet."}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
