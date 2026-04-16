'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AnnouncementComposer,
  type AnnouncementComposerValues,
} from '@/components/announcements/announcement-composer';

interface EditableAnnouncement {
  id: number;
  title: string;
  body: string;
  audience: 'all' | 'owners_only' | 'board_only' | 'tenants_only';
  isPinned: boolean;
}

interface AnnouncementAuthoringFormProps {
  communityId: number;
  announcement?: EditableAnnouncement;
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const errorBody = await response.json().catch(() => null) as
    | { message?: string; error?: { message?: string } }
    | null;

  return errorBody?.error?.message ?? errorBody?.message ?? fallbackMessage;
}

export function AnnouncementAuthoringForm({
  communityId,
  announcement,
}: AnnouncementAuthoringFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values: AnnouncementComposerValues) {
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        communityId,
        ...values,
      };

      if (announcement) {
        payload['action'] = 'update';
        payload['id'] = announcement.id;
      }

      const response = await fetch('/api/v1/announcements', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            announcement
              ? 'We could not update this announcement.'
              : 'We could not create this announcement.',
          ),
        );
      }

      const json = await response.json() as { data?: { id?: number } };
      const announcementId = announcement?.id ?? json.data?.id;

      if (!announcementId) {
        throw new Error('Announcement saved, but we could not open it.');
      }

      router.push(`/announcements/${announcementId}?communityId=${communityId}`);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    if (announcement) {
      router.push(`/announcements/${announcement.id}?communityId=${communityId}`);
      return;
    }

    router.push(`/announcements?communityId=${communityId}`);
  }

  return (
    <AnnouncementComposer
      initialValues={
        announcement
          ? {
              title: announcement.title,
              body: announcement.body,
              audience: announcement.audience,
              isPinned: announcement.isPinned,
            }
          : undefined
      }
      isSubmitting={isSubmitting}
      submitLabel={announcement ? 'Save announcement' : 'Publish announcement'}
      onCancel={handleCancel}
      onSubmit={handleSubmit}
    />
  );
}
