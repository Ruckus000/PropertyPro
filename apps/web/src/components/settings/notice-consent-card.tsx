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
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsCard, SettingsCardFooter, SettingsCardHeader } from '@/components/settings/settings-layout';
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

  const consentedWithStaleEmail = !!data?.consented && data.email !== data.currentEmail;

  return (
    <SettingsCard>
      <SettingsCardHeader title="Official notices by email" description={NOTICE_CONSENT_RECORD_ONLY_NOTE} />
      {isLoading ? (
        <div className="px-5 py-4">
          <Skeleton className="h-16 w-full" />
        </div>
      ) : isError || !data || !data.currentEmail ? (
        <div className="px-5 py-4">
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
        </div>
      ) : data.consented ? (
        <>
          <div className="space-y-2 px-5 py-4">
            <p className="flex items-start gap-2 text-sm text-content">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-success" aria-hidden="true" />
              <span>
                You consented on {data.givenAt ? formatDate(data.givenAt) : 'file'} to receive official notices
                by email at <span className="font-medium">{data.email}</span>.
              </span>
            </p>
            {consentedWithStaleEmail ? (
              <p className="text-sm text-content-secondary">
                Your sign-in email has changed since then. Consent again to cover {data.currentEmail}.
              </p>
            ) : null}
          </div>
          <SettingsCardFooter note={<SaveErrorNote show={setConsent.isError} />}>
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
            {consentedWithStaleEmail ? (
              <Button size="sm" disabled={setConsent.isPending} onClick={() => setConsent.mutate(true)}>
                Consent for {data.currentEmail}
              </Button>
            ) : null}
          </SettingsCardFooter>
        </>
      ) : (
        <>
          <p className="px-5 py-4 text-sm text-content-secondary">{noticeConsentText(data.currentEmail)}</p>
          <SettingsCardFooter note={<SaveErrorNote show={setConsent.isError} />}>
            <Button size="sm" disabled={setConsent.isPending} onClick={() => setConsent.mutate(true)}>
              Give consent
            </Button>
          </SettingsCardFooter>
        </>
      )}
    </SettingsCard>
  );
}

function SaveErrorNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="text-status-danger" role="alert">
      We couldn&apos;t save that. Please try again.
    </span>
  );
}
