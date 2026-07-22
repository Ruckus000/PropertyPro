'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AnnouncementComposer,
  type AnnouncementComposerValues,
} from '@/components/announcements/announcement-composer';
import { useMutateAnnouncement } from '@/hooks/use-mutate-announcement';

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

export function AnnouncementAuthoringForm({
  communityId,
  announcement,
}: AnnouncementAuthoringFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mutateAnnouncement = useMutateAnnouncement();

  async function handleSubmit(values: AnnouncementComposerValues) {
    setIsSubmitting(true);

    try {
      const json = await mutateAnnouncement.mutateAsync({
        communityId,
        ...values,
        ...(announcement
          ? { action: 'update' as const, id: announcement.id }
          : {}),
      });

      const announcementId = announcement?.id ?? json.data?.id;

      if (!announcementId) {
        throw new Error('Announcement saved, but we could not open it.');
      }

      toast.success(announcement ? 'Announcement updated.' : 'Announcement published.');
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
