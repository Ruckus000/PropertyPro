'use client';

/**
 * Electronic-notice consent (§718.112(2)(d), §720.303) — unit owners only.
 *
 * Recording consent changes nothing about delivery yet, and the card says so,
 * so an owner does not stop checking their mailbox on the strength of it.
 */
import * as React from 'react';
import { MailCheck } from 'lucide-react';
import { NOTICE_CONSENT_RECORD_ONLY_NOTE, noticeConsentText } from '@propertypro/shared';
import { AlertBanner } from '@/components/shared/alert-banner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useNoticeConsent, useSetNoticeConsent } from '@/hooks/use-notice-consent';

interface Props {
  communityId: number;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function NoticeConsentCard({ communityId }: Props) {
  const { data, isLoading, isError, refetch } = useNoticeConsent(communityId);
  const setConsent = useSetNoticeConsent(communityId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Official notices by email</CardTitle>
        <CardDescription>{NOTICE_CONSENT_RECORD_ONLY_NOTE}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : isError || !data || !data.currentEmail ? (
          <AlertBanner
            status="danger"
            variant="subtle"
            title="We couldn't load your consent"
            description="Please try again."
            action={
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        ) : data.consented ? (
          <>
            <p className="flex items-start gap-2 text-sm text-content">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />
              <span>
                You consented on {data.givenAt ? formatDate(data.givenAt) : 'file'} to receive official notices
                by email at <span className="font-medium">{data.email}</span>.
              </span>
            </p>
            {data.email !== data.currentEmail ? (
              <p className="text-sm text-content-secondary">
                Your sign-in email has changed since then. Consent again to cover {data.currentEmail}.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {data.email !== data.currentEmail ? (
                <Button size="sm" disabled={setConsent.isPending} onClick={() => setConsent.mutate(true)}>
                  Consent for {data.currentEmail}
                </Button>
              ) : null}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={setConsent.isPending}>
                    Withdraw consent
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Withdraw consent?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your association will have a record that you no longer consent to receive official notices
                      by email. You can consent again at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep consent</AlertDialogCancel>
                    <AlertDialogAction onClick={() => setConsent.mutate(false)}>Withdraw consent</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-content-secondary">{noticeConsentText(data.currentEmail)}</p>
            <Button size="sm" disabled={setConsent.isPending} onClick={() => setConsent.mutate(true)}>
              Give consent
            </Button>
          </>
        )}
        {setConsent.isError ? (
          <p className="text-sm text-status-danger" role="alert">
            We couldn&apos;t save that. Please try again.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
