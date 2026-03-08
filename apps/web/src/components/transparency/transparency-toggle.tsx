"use client";

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button, Card, StatusBadge } from '@propertypro/ui';

interface Props {
  communityId: number;
  subdomain: string;
}

interface SettingsResponse {
  enabled: boolean;
  acknowledgedAt: string | null;
}

export function TransparencyToggle({ communityId, subdomain }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transparencyUrl = useMemo(() => `/${subdomain}/transparency`, [subdomain]);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        setLoading(true);
        const response = await fetch(`/api/v1/transparency/settings?communityId=${communityId}`);
        const json = (await response.json()) as { data: SettingsResponse };

        if (!response.ok) {
          throw new Error('Failed to load transparency settings');
        }

        if (!cancelled) {
          setEnabled(json.data.enabled);
          setAcknowledgedAt(json.data.acknowledgedAt);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load transparency settings.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/v1/transparency/settings', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          communityId,
          enabled,
          acknowledged,
        }),
      });

      const json = (await response.json()) as {
        data?: SettingsResponse;
        error?: { message?: string };
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to save settings');
      }

      setEnabled(json.data.enabled);
      setAcknowledgedAt(json.data.acknowledgedAt);
      setSuccess(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save transparency settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-600">Loading transparency settings...</p>;
  }

  const needsAcknowledgment = enabled && !acknowledgedAt && !acknowledged;

  return (
    <Card className="border-gray-200 bg-white">
      <Card.Header>
        <div className="flex flex-col">
          <Card.Title>Compliance Transparency Page</Card.Title>
          <Card.Subtitle>Control whether your public transparency page is visible.</Card.Subtitle>
        </div>
      </Card.Header>

      <Card.Body>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
          ) : null}
          {success ? (
            <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              Transparency settings updated.
            </p>
          ) : null}

          <div className="rounded-md border border-gray-200 p-3">
            <p className="text-sm font-medium text-gray-800">Preview</p>
            <a
              className="mt-1 inline-flex text-sm font-medium text-blue-700 underline"
              href={transparencyUrl}
              rel="noreferrer"
              target="_blank"
            >
              Preview what your transparency page will look like
            </a>
          </div>

          <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
            <input
              aria-label="Enable compliance transparency page"
              checked={enabled}
              className="mt-1 h-5 w-5 rounded border-gray-300"
              onChange={(event) => setEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Enable public transparency page</span>
              <span className="block text-sm text-gray-600">
                When enabled, your public URL is available at <code>{transparencyUrl}</code>.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-gray-200 p-3">
            <input
              aria-label="Acknowledge transparency page scope"
              checked={acknowledged}
              className="mt-1 h-5 w-5 rounded border-gray-300"
              onChange={(event) => setAcknowledged(event.target.checked)}
              type="checkbox"
            />
            <span className="text-sm text-gray-700">
              I understand that this page displays factual data tracked within PropertyPro. It does not constitute
              legal certification, and tracked items are publicly visible.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <StatusBadge status={enabled ? 'completed' : 'neutral'} showLabel={false} />
              <span>{enabled ? 'Page is live' : 'Page is not publicly visible'}</span>
            </div>
            <Button disabled={saving || needsAcknowledgment} type="submit">
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>

          {needsAcknowledgment ? (
            <p className="text-xs text-red-700">
              Check the acknowledgment box before enabling transparency for the first time.
            </p>
          ) : null}
        </form>
      </Card.Body>
    </Card>
  );
}
