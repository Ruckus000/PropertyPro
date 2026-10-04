'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useLiveBranding, useSaveLiveBranding } from '@/hooks/use-live-branding';

/** Mirrors `customEmailFooter`'s `.max(500)` in the branding route contract. */
const MAX_LENGTH = 500;

interface Props {
  communityId: number;
  communityName: string;
}

/**
 * A line of text at the bottom of every email the community sends: office
 * hours, a phone number, a sign-off. Managers only, like the route it saves
 * through. Empty clears it.
 */
export function EmailFooterCard({ communityId, communityName }: Props) {
  const { data, isError } = useLiveBranding(communityId);
  const save = useSaveLiveBranding(communityId);
  const [draft, setDraft] = React.useState<string | null>(null);

  const stored = data?.customEmailFooter ?? '';
  const value = draft ?? stored;
  const changed = draft !== null && draft !== stored;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    save.mutate(
      { customEmailFooter: value.trim() },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success(value.trim() ? 'Email footer saved.' : 'Email footer removed.');
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email footer</CardTitle>
        <CardDescription>
          Shown at the bottom of every email from {communityName}, such as office hours or a phone
          number.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-status-danger">Couldn’t load the email footer. Refresh to try again.</p>
        ) : !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="email-footer">Footer text</Label>
                <span className="text-xs text-content-tertiary">
                  {value.length}/{MAX_LENGTH}
                </span>
              </div>
              <Textarea
                id="email-footer"
                value={value}
                maxLength={MAX_LENGTH}
                rows={3}
                readOnly={save.isPending}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Office hours: Monday to Friday, 9am to 5pm."
              />
            </div>
            {save.isError && (
              <p className="text-sm text-status-danger">That change didn’t save. Try again.</p>
            )}
            <Button type="submit" size="sm" disabled={!changed || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save footer'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
