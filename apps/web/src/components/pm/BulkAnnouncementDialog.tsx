'use client';

/**
 * Bulk Announcement Dialog — send an announcement to multiple communities.
 *
 * Uses shadcn Dialog, TanStack Mutation, and the bulk announcements API.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertBanner } from '@/components/shared/alert-banner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Community {
  id: number;
  name: string;
}

interface BulkAnnouncementDialogProps {
  selectedCommunities: Community[];
  open: boolean;
  onClose: () => void;
}

interface BulkResult {
  communityId: number;
  communityName: string;
  status: 'sent' | 'failed';
  error?: string;
}

interface BulkAnnouncementResponse {
  results: BulkResult[];
}

type Audience = 'all' | 'owners_only' | 'board_only' | 'tenants_only';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkAnnouncementDialog({
  selectedCommunities,
  open,
  onClose,
}: BulkAnnouncementDialogProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [isPinned, setIsPinned] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultIsError, setResultIsError] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/pm/bulk/announcements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          communityIds: selectedCommunities.map((c) => c.id),
          title,
          body,
          audience,
          isPinned,
        }),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message?: string } };
        throw new Error(json.error?.message ?? 'Failed to send bulk announcement');
      }

      return (await res.json()) as BulkAnnouncementResponse;
    },
    onSuccess: (data) => {
      const sent = data.results.filter((r) => r.status === 'sent').length;
      const total = data.results.length;
      setResultMessage(`Sent to ${sent}/${total} communities`);
      setResultIsError(false);
      setShowConfirm(false);
    },
    onError: (error: Error) => {
      setResultMessage(error.message);
      setResultIsError(true);
      setShowConfirm(false);
    },
  });

  function resetForm() {
    setTitle('');
    setBody('');
    setAudience('all');
    setIsPinned(false);
    setShowConfirm(false);
    setResultMessage(null);
    setResultIsError(false);
    mutation.reset();
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setShowConfirm(true);
  }

  function handleConfirm() {
    mutation.mutate();
  }

  const isFormValid = title.trim().length > 0 && body.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Announcement</DialogTitle>
          <DialogDescription>
            Send an announcement to {selectedCommunities.length} selected{' '}
            {selectedCommunities.length === 1 ? 'community' : 'communities'}.
          </DialogDescription>
        </DialogHeader>

        {resultMessage ? (
          <div className="space-y-4">
            <AlertBanner
              status={resultIsError ? 'danger' : 'success'}
              title={resultIsError ? 'Error' : 'Sent'}
              description={resultMessage}
            />
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : showConfirm ? (
          <div className="space-y-4">
            <p className="text-sm text-content">
              Send &ldquo;{title}&rdquo; to{' '}
              <strong>{selectedCommunities.length}</strong>{' '}
              {selectedCommunities.length === 1 ? 'community' : 'communities'}. Confirm?
            </p>
            <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-content-tertiary">
              {selectedCommunities.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowConfirm(false)}
                disabled={mutation.isPending}
              >
                Back
              </Button>
              <Button onClick={handleConfirm} disabled={mutation.isPending}>
                {mutation.isPending ? 'Sending...' : 'Confirm & Send'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="bulk-ann-title" className="mb-1 block text-sm font-medium text-content">
                Title
              </label>
              <input
                id="bulk-ann-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={500}
                className="w-full rounded border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                placeholder="Announcement title"
              />
            </div>

            {/* Body */}
            <div>
              <label htmlFor="bulk-ann-body" className="mb-1 block text-sm font-medium text-content">
                Body
              </label>
              <textarea
                id="bulk-ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="w-full rounded border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
                placeholder="Announcement body text..."
              />
            </div>

            {/* Audience */}
            <div>
              <label className="mb-1 block text-sm font-medium text-content">
                Audience
              </label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  <SelectItem value="owners_only">Owners Only</SelectItem>
                  <SelectItem value="board_only">Board Only</SelectItem>
                  <SelectItem value="tenants_only">Tenants Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pinned */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="bulk-ann-pinned"
                checked={isPinned}
                onCheckedChange={(checked) => setIsPinned(checked === true)}
              />
              <label htmlFor="bulk-ann-pinned" className="text-sm text-content">
                Pin this announcement
              </label>
            </div>

            <DialogFooter>
              <Button variant="outline" type="button" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isFormValid}>
                Review & Send
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
