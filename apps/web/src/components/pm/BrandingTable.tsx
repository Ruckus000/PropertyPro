'use client';

/**
 * Branding Table — shows per-community branding status with edit/copy actions.
 *
 * Displays community name, logo thumbnail, primary color swatch, font, and
 * action buttons for editing and copying branding across communities.
 */
import { useState } from 'react';
import type { CommunityBranding } from '@propertypro/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { BrandingCopyDialog } from './BrandingCopyDialog';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommunityWithBranding {
  communityId: number;
  communityName: string;
  branding: CommunityBranding | null;
}

interface BrandingTableProps {
  /** Current community ID the user is viewing (used for the "Edit" link) */
  currentCommunityId: number;
  /** All communities managed by the PM, with their branding data */
  communities: CommunityWithBranding[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BrandingTable({ currentCommunityId, communities }: BrandingTableProps) {
  const [copySource, setCopySource] = useState<{
    id: number;
    name: string;
    branding: CommunityBranding;
  } | null>(null);

  const managedCommunities = communities.map((c) => ({
    id: c.communityId,
    name: c.communityName,
  }));

  function handleEdit(communityId: number) {
    // Navigate to branding form for that community
    window.location.href = `/pm/settings/branding?communityId=${communityId}`;
  }

  function handleCopyFrom(community: CommunityWithBranding) {
    if (!community.branding) return;
    setCopySource({
      id: community.communityId,
      name: community.communityName,
      branding: community.branding,
    });
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Community</TableHead>
              <TableHead>Logo</TableHead>
              <TableHead>Primary Color</TableHead>
              <TableHead>Font</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {communities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-gray-400">
                  No communities found
                </TableCell>
              </TableRow>
            ) : (
              communities.map((community) => {
                const branding = community.branding;
                const primaryColor = branding?.primaryColor;
                const font = branding?.fontHeading ?? branding?.fontBody;
                const hasLogo = !!branding?.logoPath;

                return (
                  <TableRow key={community.communityId}>
                    <TableCell className="font-medium">{community.communityName}</TableCell>

                    {/* Logo */}
                    <TableCell>
                      {hasLogo ? (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-xs text-gray-500">
                          Logo
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Default</span>
                      )}
                    </TableCell>

                    {/* Primary Color */}
                    <TableCell>
                      {primaryColor ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="h-5 w-5 rounded border border-gray-200"
                            style={{ backgroundColor: primaryColor }}
                          />
                          <span className="font-mono text-xs text-gray-500">{primaryColor}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Default</span>
                      )}
                    </TableCell>

                    {/* Font */}
                    <TableCell>
                      {font ? (
                        <span className="text-sm text-gray-700">{font}</span>
                      ) : (
                        <span className="text-xs text-gray-400">Default</span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(community.communityId)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyFrom(community)}
                          disabled={!branding}
                        >
                          Copy From
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Copy Dialog */}
      {copySource && (
        <BrandingCopyDialog
          sourceCommunity={copySource}
          managedCommunities={managedCommunities}
          open={!!copySource}
          onClose={() => setCopySource(null)}
        />
      )}
    </>
  );
}
