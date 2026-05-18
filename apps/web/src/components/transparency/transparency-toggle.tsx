"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button, Card, StatusBadge } from '@propertypro/ui';
import {
  useTransparencySettings,
  useUpdateTransparencySettings,
} from '@/hooks/use-transparency';

interface Props {
  communityId: number;
  subdomain: string;
}

export function TransparencyToggle({ communityId, subdomain }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transparencyUrl = useMemo(() => `/${subdomain}/transparency`, [subdomain]);

  const settingsQuery = useTransparencySettings(communityId);
  const updateSettings = useUpdateTransparencySettings(communityId);

  // Seed local form state from the query exactly once per community so a
  // background/post-save refetch can't clobber unsaved edits.
  const seededRef = useRef<number | null>(null);
  useEffect(() => {
    if (settingsQuery.data && seededRef.current !== communityId) {
      seededRef.current = communityId;
      setEnabled(settingsQuery.data.enabled);
      setAcknowledgedAt(settingsQuery.data.acknowledgedAt);
    }
  }, [settingsQuery.data, communityId]);

  useEffect(() => {
    if (settingsQuery.isError) {
      setError('Failed to load transparency settings.');
    }
  }, [settingsQuery.isError]);

  const loading = settingsQuery.isLoading;
  const saving = updateSettings.isPending;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setSuccess(false);

    updateSettings.mutate(
      { enabled, acknowledged },
      {
        onSuccess: (data) => {
          setEnabled(data.enabled);
          setAcknowledgedAt(data.acknowledgedAt);
          setSuccess(true);
        },
        onError: (saveError) => {
          setError(
            saveError instanceof Error
              ? saveError.message
              : 'Failed to save transparency settings.',
          );
        },
      },
    );
  }

  if (loading) {
    return <p className="text-sm text-content-secondary">Loading transparency settings...</p>;
  }

  const needsAcknowledgment = enabled && !acknowledgedAt && !acknowledged;

  return (
    <Card className="border-edge bg-surface-card">
      <Card.Header>
        <div className="flex flex-col">
          <Card.Title>Compliance Transparency Page</Card.Title>
          <Card.Subtitle>Control whether your public transparency page is visible.</Card.Subtitle>
        </div>
      </Card.Header>

      <Card.Body>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-md border border-status-danger-border bg-status-danger-bg p-3 text-sm text-status-danger">{error}</p>
          ) : null}
          {success ? (
            <p className="rounded-md border border-status-success-border bg-status-success-bg p-3 text-sm text-status-success">
              Transparency settings updated.
            </p>
          ) : null}

          <div className="rounded-md border border-edge p-3">
            <p className="text-sm font-medium text-content">Preview</p>
            <a
              className="mt-1 inline-flex text-sm font-medium text-content-link underline"
              href={transparencyUrl}
              rel="noreferrer"
              target="_blank"
            >
              Preview what your transparency page will look like
            </a>
          </div>

          <label className="flex items-start gap-3 rounded-md border border-edge p-3">
            <input
              aria-label="Enable compliance transparency page"
              checked={enabled}
              className="mt-1 h-5 w-5 rounded border-edge-strong"
              onChange={(event) => setEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-medium text-content">Enable public transparency page</span>
              <span className="block text-sm text-content-secondary">
                When enabled, your public URL is available at <code>{transparencyUrl}</code>.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-edge p-3">
            <input
              aria-label="Acknowledge transparency page scope"
              checked={acknowledged}
              className="mt-1 h-5 w-5 rounded border-edge-strong"
              onChange={(event) => setAcknowledged(event.target.checked)}
              type="checkbox"
            />
            <span className="text-sm text-content-secondary">
              I understand that this page displays factual data tracked within PropertyPro. It does not constitute
              legal certification, and tracked items are publicly visible.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-content-secondary">
              <StatusBadge status={enabled ? 'completed' : 'neutral'} showLabel={false} />
              <span>{enabled ? 'Page is live' : 'Page is not publicly visible'}</span>
            </div>
            <Button disabled={saving || needsAcknowledgment} type="submit">
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>

          {needsAcknowledgment ? (
            <p className="text-xs text-status-danger">
              Check the acknowledgment box before enabling transparency for the first time.
            </p>
          ) : null}
        </form>
      </Card.Body>
    </Card>
  );
}
