'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreatePoll } from '@/hooks/use-board';

interface CreatePollDialogProps {
  communityId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePollDialog({
  communityId,
  open,
  onOpenChange,
}: CreatePollDialogProps) {
  const createPoll = useCreatePoll(communityId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pollType, setPollType] = useState<'single_choice' | 'multiple_choice'>('single_choice');
  const [options, setOptions] = useState(['', '']);
  const [endsAt, setEndsAt] = useState('');

  const normalizedOptions = options.map((option) => option.trim()).filter(Boolean);
  const canSubmit = title.trim().length > 0 && normalizedOptions.length >= 2 && normalizedOptions.length <= 20;

  async function handleSubmit() {
    await createPoll.mutateAsync({
      title: title.trim(),
      description: description.trim() || null,
      pollType,
      options: normalizedOptions,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    });

    setTitle('');
    setDescription('');
    setPollType('single_choice');
    setOptions(['', '']);
    setEndsAt('');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Create poll</DialogTitle>
          <DialogDescription>Create a board poll with between 2 and 20 options.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {createPoll.error ? (
            <AlertBanner
              status="danger"
              variant="subtle"
              title="We couldn't create this poll."
              description={createPoll.error instanceof Error ? createPoll.error.message : 'Please try again.'}
            />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="poll-title">Title</Label>
            <Input id="poll-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} className="h-11 md:h-9" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="poll-description">Description</Label>
            <Textarea id="poll-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={5000} />
          </div>

          <div className="space-y-2">
            <Label>Poll type</Label>
            <Select value={pollType} onValueChange={(value) => setPollType(value as 'single_choice' | 'multiple_choice')}>
              <SelectTrigger className="h-11 md:h-9">
                <SelectValue placeholder="Select poll type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single_choice">Single Choice</SelectItem>
                <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Options</Label>
              <Button
                type="button"
                variant="outline"
                className="h-11 md:h-9"
                disabled={options.length >= 20}
                onClick={() => setOptions((current) => [...current, ''])}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Option
              </Button>
            </div>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={`poll-option-${index}`} className="flex items-center gap-2">
                  <Input
                    value={option}
                    onChange={(event) => {
                      const next = [...options];
                      next[index] = event.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Option ${index + 1}`}
                    className="h-11 md:h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 md:h-9 md:w-9"
                    disabled={options.length <= 2}
                    onClick={() => setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Remove option</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="poll-ends-at">End date</Label>
            <Input id="poll-ends-at" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="h-11 md:h-9" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="h-11 md:h-9" disabled={!canSubmit || createPoll.isPending} onClick={() => void handleSubmit()}>
            {createPoll.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Create Poll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
