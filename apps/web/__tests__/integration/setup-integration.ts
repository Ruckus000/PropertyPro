import { clearTestInbox } from '@propertypro/email';
import { beforeEach, vi } from 'vitest';
import { getTestAuthUserId } from './providers/test-auth-provider';
import {
  captureAnnouncementDelivery,
  captureNotification,
  clearCapturedAnnouncementDeliveries,
  clearCapturedNotifications,
} from './providers/test-capture-sinks';
import {
  createPresignedDownloadUrlDouble,
  createPresignedUploadUrlDouble,
  deleteStorageObjectDouble,
  clearCapturedStorageOps,
} from './providers/test-storage-provider';
import {
  clearCapturedPdfExtractions,
  queuePdfExtractionDouble,
} from './providers/test-pdf-double';

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: async () => getTestAuthUserId(),
}));

vi.mock('@/lib/services/notification-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/notification-service')>();

  return {
    ...actual,
    sendNotification: async (
      communityId: number,
      event: import('@/lib/services/notification-service').NotificationEvent,
      recipientFilter: import('@/lib/services/notification-service').RecipientFilter,
      actorUserId?: string,
    ) => {
      captureNotification({ communityId, event, recipientFilter, actorUserId });
      return 1;
    },
    queueNotification: async (
      communityId: number,
      event: import('@/lib/services/notification-service').NotificationEvent,
      recipientFilter: import('@/lib/services/notification-service').RecipientFilter,
      actorUserId?: string,
    ) => {
      captureNotification({ communityId, event, recipientFilter, actorUserId });
      return 1;
    },
  };
});

vi.mock('@/lib/services/announcement-delivery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/announcement-delivery')>();
  return {
    ...actual,
    queueAnnouncementDelivery: async (
      params: Parameters<typeof actual.queueAnnouncementDelivery>[0],
    ) => {
      captureAnnouncementDelivery(params);
      return 1;
    },
  };
});

vi.mock('@/lib/workers/pdf-extraction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workers/pdf-extraction')>();
  return {
    ...actual,
    queuePdfExtraction: queuePdfExtractionDouble,
  };
});

vi.mock('@propertypro/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@propertypro/db')>();
  return {
    ...actual,
    createPresignedUploadUrl: createPresignedUploadUrlDouble,
    createPresignedDownloadUrl: createPresignedDownloadUrlDouble,
    deleteStorageObject: deleteStorageObjectDouble,
  };
});

vi.mock('@propertypro/db/supabase/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@propertypro/db/supabase/admin')>();
  return {
    ...actual,
    createAdminClient: () => ({
      auth: {
        admin: {
          createUser: async () => ({
            data: {
              user: { id: 'test-auth-user' },
            },
            error: null,
          }),
        },
      },
      storage: {
        from: (bucket: string) => ({
          createSignedUploadUrl: async (path: string) => ({
            data: await createPresignedUploadUrlDouble(bucket, path),
            error: null,
          }),
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: await createPresignedDownloadUrlDouble(bucket, path) },
            error: null,
          }),
          remove: async (paths: string[]) => {
            await Promise.all(paths.map((path) => deleteStorageObjectDouble(bucket, path)));
            return { data: null, error: null };
          },
        }),
      },
    }),
  };
});

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  clearTestInbox();
  clearCapturedNotifications();
  clearCapturedAnnouncementDeliveries();
  clearCapturedStorageOps();
  clearCapturedPdfExtractions();
});
