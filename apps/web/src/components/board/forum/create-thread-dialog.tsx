'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateForumThread } from '@/hooks/use-board';

interface CreateThreadDialogProps {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateThreadDialog({
  communityId,
  open,
  onOpenChange,
}: CreateThreadDialogProps) {
  const createThread = useCreateForumThread(communityId);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function handleSubmit() {
    await createThread.mutateAsync({
      title: title.trim(),
      body: body.trim(),
    });

    setTitle('');
    setBody('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New thread</DialogTitle>
          <DialogDescription>Start a new discussion for your board community.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {createThread.error ? (
            <AlertBanner
              status="danger"
              variant="subtle"
              title="We couldn't create this thread."
              description={createThread.error instanceof Error ? createThread.error.message : 'Please try again.'}
            />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="thread-title">Title</Label>
            <Input id="thread-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} className="h-11 md:h-9" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="thread-body">Body</Label>
            <Textarea id="thread-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={8000} className="min-h-32" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 md:h-9"
            disabled={title.trim().length === 0 || body.trim().length === 0 || createThread.isPending}
            onClick={() => void handleSubmit()}
          >
            {createThread.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Create Thread
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
