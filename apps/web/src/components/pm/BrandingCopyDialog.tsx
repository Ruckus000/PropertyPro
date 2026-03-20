'use client';

/**
 * Branding Copy Dialog — copy branding properties from one community to others.
 *
 * Allows selecting which branding properties to copy (logo, colors, fonts)
 * and which target communities to apply them to.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { CommunityBranding } from '@propertypro/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Community {
  id: number;
  name: string;
}

interface BrandingCopyDialogProps {
  sourceCommunity: { id: number; name: string; branding: CommunityBranding };
  managedCommunities: Community[];
  open: boolean;
  onClose: () => void;
}

type BrandingProperty = 'logoPath' | 'primaryColor' | 'secondaryColor' | 'accentColor' | 'fontHeading' | 'fontBody';

const BRANDING_PROPERTIES: Array<{ key: BrandingProperty; label: string }> = [
  { key: 'logoPath', label: 'Logo' },
  { key: 'primaryColor', label: 'Primary Color' },
  { key: 'secondaryColor', label: 'Secondary Color' },
  { key: 'accentColor', label: 'Accent Color' },
  { key: 'fontHeading', label: 'Heading Font' },
  { key: 'fontBody', label: 'Body Font' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BrandingCopyDialog({
  sourceCommunity,
  managedCommunities,
  open,
  onClose,
}: BrandingCopyDialogProps) {
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<Set<number>>(new Set());
  const [selectedProperties, setSelectedProperties] = useState<Set<BrandingProperty>>(
    new Set(['primaryColor', 'secondaryColor', 'accentColor', 'fontHeading', 'fontBody']),
  );
  const [showConfirm, setShowConfirm] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Exclude source community from targets
  const targetCommunities = managedCommunities.filter((c) => c.id !== sourceCommunity.id);

  const mutation = useMutation({
    mutationFn: async () => {
      // Build the branding patch from selected properties
      const patch: Record<string, unknown> = {};
      for (const prop of selectedProperties) {
        const value = sourceCommunity.branding[prop];
        if (value !== undefined) {
          // Map logoPath to logoStoragePath for the branding API
          if (prop === 'logoPath') {
            patch['logoStoragePath'] = value;
          } else {
            patch[prop] = value;
          }
        }
      }

      // PATCH each target community's branding
      const results = await Promise.allSettled(
        Array.from(selectedCommunityIds).map(async (communityId) => {
          const res = await fetch('/api/v1/pm/branding', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ communityId, ...patch }),
          });

          if (!res.ok) {
            const json = (await res.json()) as { error?: { message?: string } };
            throw new Error(json.error?.message ?? `Failed for community ${communityId}`);
          }

          return communityId;
        }),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      return { succeeded, total: results.length };
    },
    onSuccess: (data) => {
      setResultMessage(`Branding copied to ${data.succeeded}/${data.total} communities`);
      setShowConfirm(false);
    },
    onError: (error: Error) => {
      setResultMessage(`Error: ${error.message}`);
      setShowConfirm(false);
    },
  });

  function resetForm() {
    setSelectedCommunityIds(new Set());
    setSelectedProperties(
      new Set(['primaryColor', 'secondaryColor', 'accentColor', 'fontHeading', 'fontBody']),
    );
    setShowConfirm(false);
    setResultMessage(null);
    mutation.reset();
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function toggleCommunity(id: number) {
    setSelectedCommunityIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleProperty(key: BrandingProperty) {
    setSelectedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function handleSubmit() {
    if (selectedCommunityIds.size === 0 || selectedProperties.size === 0) return;
    setShowConfirm(true);
  }

  function handleConfirm() {
    mutation.mutate();
  }

  const canSubmit = selectedCommunityIds.size > 0 && selectedProperties.size > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy Branding</DialogTitle>
          <DialogDescription>
            Copy branding settings from <strong>{sourceCommunity.name}</strong> to
            other communities.
          </DialogDescription>
        </DialogHeader>

        {resultMessage ? (
          <div className="space-y-4">
            <p
              className={`rounded border px-3 py-2 text-sm ${
                resultMessage.startsWith('Error')
                  ? 'border-status-danger-border bg-status-danger-bg text-status-danger'
                  : 'border-status-success-border bg-status-success-bg text-status-success'
              }`}
            >
              {resultMessage}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : showConfirm ? (
          <div className="space-y-4">
            <p className="text-sm text-content-secondary">
              Copy {selectedProperties.size} branding{' '}
              {selectedProperties.size === 1 ? 'property' : 'properties'} to{' '}
              <strong>{selectedCommunityIds.size}</strong>{' '}
              {selectedCommunityIds.size === 1 ? 'community' : 'communities'}?
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={mutation.isPending}
              >
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={mutation.isPending}>
                {mutation.isPending ? 'Copying...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Properties to copy */}
            <div>
              <p className="mb-2 text-sm font-medium text-content-secondary">Properties to copy</p>
              <div className="grid grid-cols-2 gap-2">
                {BRANDING_PROPERTIES.map((prop) => {
                  const hasValue = sourceCommunity.branding[prop.key] !== undefined;
                  return (
                    <div key={prop.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`prop-${prop.key}`}
                        checked={selectedProperties.has(prop.key)}
                        onCheckedChange={() => toggleProperty(prop.key)}
                        disabled={!hasValue}
                      />
                      <label
                        htmlFor={`prop-${prop.key}`}
                        className={`text-sm ${hasValue ? 'text-content-secondary' : 'text-content-disabled'}`}
                      >
                        {prop.label}
                        {!hasValue && ' (not set)'}
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Target communities */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-content-secondary">Target communities</p>
                {targetCommunities.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCommunityIds.size === targetCommunities.length) {
                        setSelectedCommunityIds(new Set());
                      } else {
                        setSelectedCommunityIds(new Set(targetCommunities.map((c) => c.id)));
                      }
                    }}
                    className="text-xs text-interactive hover:underline"
                  >
                    {selectedCommunityIds.size === targetCommunities.length
                      ? 'Deselect all'
                      : 'Select all'}
                  </button>
                )}
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-edge p-2">
                {targetCommunities.length === 0 ? (
                  <p className="py-2 text-center text-xs text-content-disabled">
                    No other communities available
                  </p>
                ) : (
                  targetCommunities.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`community-${c.id}`}
                        checked={selectedCommunityIds.has(c.id)}
                        onCheckedChange={() => toggleCommunity(c.id)}
                      />
                      <label htmlFor={`community-${c.id}`} className="text-sm text-content-secondary">
                        {c.name}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                Review
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
