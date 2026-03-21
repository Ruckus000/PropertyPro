'use client';

import { useState } from 'react';
import { z } from 'zod';
import {
  createMaintenanceRequest,
  requestPhotoUploadUrl,
  type MaintenanceRequestItem,
} from '@/lib/api/maintenance-requests';

const CATEGORIES = ['plumbing', 'electrical', 'hvac', 'general', 'other'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().min(1, 'Description is required').max(5000),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
});

interface SubmitFormProps {
  communityId: number;
  userId: string;
  onCreated?: (request: MaintenanceRequestItem) => void;
}

export function SubmitForm({ communityId, onCreated }: SubmitFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<typeof CATEGORIES[number]>('general');
  const [priority, setPriority] = useState<typeof PRIORITIES[number]>('normal');
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const total = photos.length + files.length;
    if (total > 5) {
      setServerError('Maximum 5 photos allowed');
      return;
    }
    setPhotos((prev) => [...prev, ...files].slice(0, 5));
    setServerError(null);
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadPhotos(): Promise<string[]> {
    const storagePaths: string[] = [];
    for (const file of photos) {
      const { data } = await requestPhotoUploadUrl({
        communityId,
        filename: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });
      await fetch(data.uploadUrl, { method: 'PUT', body: file });
      storagePaths.push(data.storagePath);
    }
    return storagePaths;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError(null);

    const parsed = formSchema.safeParse({ title, description, category, priority });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      // Upload photos first if any, then pass storage paths to the create call
      let storagePaths: string[] = [];
      if (photos.length > 0) {
        setUploading(true);
        storagePaths = await uploadPhotos();
        setUploading(false);
      }

      const result = await createMaintenanceRequest({
        communityId,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        priority: parsed.data.priority,
        storagePaths: storagePaths.length > 0 ? storagePaths : undefined,
      });

      setTitle('');
      setDescription('');
      setCategory('general');
      setPriority('normal');
      setPhotos([]);
      onCreated?.(result.data);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-edge bg-surface-card p-6">
      <h2 className="text-lg font-semibold text-content">Submit Maintenance Request</h2>

      <div>
        <label htmlFor="mr-title" className="block text-sm font-medium text-content-secondary">
          Title <span className="text-status-danger">*</span>
        </label>
        <input
          id="mr-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={500}
          className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm shadow-e0 focus:border-edge-focus focus:outline-none focus:ring-1 ring-focus"
        />
        {fieldErrors['title'] && (
          <p className="mt-1 text-xs text-status-danger" role="alert">{fieldErrors['title']}</p>
        )}
      </div>

      <div>
        <label htmlFor="mr-description" className="block text-sm font-medium text-content-secondary">
          Description <span className="text-status-danger">*</span>
        </label>
        <textarea
          id="mr-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={5000}
          rows={4}
          className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm shadow-e0 focus:border-edge-focus focus:outline-none focus:ring-1 ring-focus"
        />
        {fieldErrors['description'] && (
          <p className="mt-1 text-xs text-status-danger" role="alert">{fieldErrors['description']}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="mr-category" className="block text-sm font-medium text-content-secondary">
            Category
          </label>
          <select
            id="mr-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number])}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm shadow-e0 focus:border-edge-focus focus:outline-none focus:ring-1 ring-focus"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.charAt(0).toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="mr-priority" className="block text-sm font-medium text-content-secondary">
            Priority
          </label>
          <select
            id="mr-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof PRIORITIES[number])}
            className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm shadow-e0 focus:border-edge-focus focus:outline-none focus:ring-1 ring-focus"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="mr-photos" className="block text-sm font-medium text-content-secondary">
          Photos (max 5)
        </label>
        <input
          id="mr-photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={handlePhotoChange}
          className="mt-1 block w-full rounded-md border border-edge-strong px-3 py-2 text-sm text-content-tertiary shadow-e0 focus:border-edge-focus focus:outline-none focus:ring-1 ring-focus file:mr-2 file:rounded-md file:border-0 file:bg-interactive-subtle file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-interactive hover:file:bg-interactive-subtle"
        />
        {photos.length > 0 && (
          <ul className="mt-2 space-y-1">
            {photos.map((f, idx) => (
              <li key={idx} className="flex items-center justify-between text-xs text-content-secondary">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="ml-2 text-status-danger hover:text-status-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {serverError && (
        <p className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger" role="alert">{serverError}</p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white hover:bg-interactive-hover disabled:opacity-50"
      >
        {uploading ? 'Uploading photos...' : submitting ? 'Submitting...' : 'Submit Request'}
      </button>
    </form>
  );
}
