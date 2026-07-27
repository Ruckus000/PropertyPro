'use client';

/**
 * CommunityPickerDialog — the in-context community picker, opened from the
 * sidebar when a nav item is clicked with no community in scope.
 *
 * Without it, every community-scoped nav item collapses to a single
 * `/select-community` href (see `resolveNavItemHref`), so on the picker page
 * itself — where the shell renders with `community = null` — clicking "Documents"
 * re-navigates to the page you are already on and silently discards the
 * destination. This dialog keeps the destination and asks only for the missing
 * half of the address: which community.
 *
 * Two deliberate implementation choices:
 *
 *   • Rows are plain `<a>`, not `router.push`. A full document load lets
 *     middleware re-resolve tenancy and forward `x-community-id`, which is the
 *     same reason `CommunityPickerGrid` uses anchors.
 *   • Every href is normalised through `applyCommunityIdToReturnTo`. Path-scoped
 *     items build `/communities/5/documents` with no query param, and tenant
 *     resolution has no path-based branch — without the injected `?communityId=`
 *     the click would bounce straight back to /select-community.
 */
import { COMMUNITY_TYPE_DISPLAY_NAMES } from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserCommunities } from '@/hooks/use-user-communities';
import { applyCommunityIdToReturnTo } from '@/lib/utils/return-to';

export interface CommunityPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Label of the nav item that was clicked, used in the dialog description. */
  itemLabel: string | null;
  /**
   * Destination builder taken from the clicked nav item (`NavItemConfig['href']`).
   * Called with the picked community's id to produce that item's real page.
   */
  buildDestination: ((communityId: number) => string) | null;
}

export function CommunityPickerDialog({
  open,
  onOpenChange,
  itemLabel,
  buildDestination,
}: CommunityPickerDialogProps) {
  // `enabled` is implicit: the dialog only mounts once the sidebar has something
  // to pick for. The query key is shared with SidebarTenantSwitcher, so the list
  // is usually already cached and the dialog paints without a request.
  const { data: communities, isPending, isError } = useUserCommunities();

  const destinationFor = (communityId: number): string =>
    applyCommunityIdToReturnTo(
      buildDestination ? buildDestination(communityId) : '/dashboard',
      communityId,
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Select a community</DialogTitle>
          <DialogDescription>
            {itemLabel
              ? `Choose which community to open ${itemLabel} for.`
              : 'Choose which community you would like to open.'}
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading your communities">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : isError ? (
          <AlertBanner
            status="danger"
            title="We couldn't load your communities"
            description="Please close this and try again."
          />
        ) : communities && communities.length > 0 ? (
          <ul role="list" className="max-h-80 space-y-1 overflow-y-auto">
            {communities.map((community) => (
              <li key={community.id}>
                <a
                  href={destinationFor(community.id)}
                  className="flex items-center justify-between gap-3 rounded-md border border-edge bg-surface-card px-3 py-3 text-left transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  aria-label={`Open ${itemLabel ?? 'this page'} for ${community.name}`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-content">
                    {community.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-content-secondary">
                    {COMMUNITY_TYPE_DISPLAY_NAMES[community.communityType] ??
                      community.communityType}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed border-edge-strong bg-surface-hover px-6 py-10 text-center">
            <p className="text-sm font-medium text-content-secondary">
              You are not a member of any community yet.
            </p>
            <p className="mt-1 text-sm text-content-disabled">
              Contact your community manager or board to request access.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
