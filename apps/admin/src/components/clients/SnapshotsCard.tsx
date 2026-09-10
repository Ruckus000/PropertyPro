/**
 * Snapshots Card — client workspace Website tab (task 17c).
 *
 * Read-only publish history for `site_publish_snapshots`. Ships with NO
 * Restore action — see
 * `.superpowers/sdd/2026-09-08-admin-console-redesign/task-17c-dispatch-notes.md`
 * §2: the route this UI would naturally post to
 * (`restore-from-snapshot/route.ts`) does something unrelated (reversing a
 * reset-to-starter), and the real publish-snapshot revert
 * (`POST /api/v1/pm/site/publish/revert`) lives in apps/web behind
 * `ensurePmAccess`, a chain a platform-admin session cannot satisfy. Building
 * a second admin route plus cross-app service reuse is new-subsystem work,
 * out of scope for a restyle slice.
 *
 * `entry.restorable` reflects `snapshot IS NOT NULL` on the row — the
 * lifecycle cron prunes that column past retention, so a logged publish can
 * exist with nothing left to restore even if this card ever grows a Restore
 * action. The two badge variants below exist to keep a pruned entry from
 * reading as actionable, not to gate a control this card doesn't offer.
 */
import { format } from 'date-fns';
import { History } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@propertypro/ui';
import type { CommunitySnapshotEntry } from '@/lib/server/community-snapshots';

interface SnapshotsCardProps {
  snapshots: CommunitySnapshotEntry[];
}

function describeChanges(entry: CommunitySnapshotEntry): string {
  if (entry.changeLabels.length > 0) return entry.changeLabels.join(', ');
  return entry.changeCount === 1 ? '1 change' : `${entry.changeCount} changes`;
}

export function SnapshotsCard({ snapshots }: SnapshotsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Publish history</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {snapshots.length === 0 ? (
          <EmptyState
            icon={History}
            size="sm"
            title="No publishes yet"
            description="Every time this community publishes its site, the publish is logged here."
          />
        ) : (
          <>
            <ul className="divide-y divide-edge-subtle">
              {snapshots.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm text-content">{describeChanges(entry)}</p>
                    <time dateTime={entry.publishedAt} className="mt-0.5 block text-xs text-content-tertiary">
                      {format(new Date(entry.publishedAt), 'MMM d, yyyy h:mm a')}
                    </time>
                  </div>
                  <Badge variant={entry.restorable ? 'info' : 'neutral'} size="sm" outlined={!entry.restorable}>
                    {entry.restorable ? 'Content retained' : 'Content pruned'}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-content-disabled">
              Read-only history. Restoring a prior publish isn&rsquo;t available from the admin console.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
