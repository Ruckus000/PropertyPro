'use client';

import { useMutation, type UseMutationResult } from '@tanstack/react-query';

export interface ManageFaqItem {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
}

interface ApiErrorBody {
  data?: ManageFaqItem;
  error?: { message?: string };
}

// Documented exception to the requestJson rule: each mutation throws a
// per-operation friendly fallback literal that the component renders verbatim
// in its inline error banner ('Unable to save FAQ changes right now.' /
// 'Unable to create this FAQ right now.' / 'Unable to delete this FAQ right
// now.'). The POST path also rejects 200 responses with missing `data`. The
// hook normalizes all network/JSON-parse failures to the operation's friendly
// fallback so the component's catch can safely display error.message.
async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export interface UpdateFaqInput {
  id: number;
  question: string;
  answer: string;
}

export interface CreateFaqInput {
  question: string;
  answer: string;
}

export function useUpdateFaq(communityId: number): UseMutationResult<void, Error, UpdateFaqInput> {
  return useMutation<void, Error, UpdateFaqInput>({
    mutationFn: async ({ id, question, answer }) => {
      let response: Response;
      try {
        response = await fetch(`/api/v1/faqs/${id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, question, answer }),
        });
      } catch {
        throw new Error('Unable to save FAQ changes right now.');
      }
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Unable to save FAQ changes right now.'));
      }
    },
  });
}

export function useCreateFaq(communityId: number): UseMutationResult<ManageFaqItem, Error, CreateFaqInput> {
  return useMutation<ManageFaqItem, Error, CreateFaqInput>({
    mutationFn: async ({ question, answer }) => {
      let response: Response;
      try {
        response = await fetch('/api/v1/faqs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, question, answer }),
        });
      } catch {
        throw new Error('Unable to create this FAQ right now.');
      }

      let body: ApiErrorBody;
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        throw new Error('Unable to create this FAQ right now.');
      }

      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? 'Unable to create this FAQ right now.');
      }
      return body.data;
    },
  });
}

export function useDeleteFaq(communityId: number): UseMutationResult<void, Error, number> {
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      let response: Response;
      try {
        response = await fetch(`/api/v1/faqs/${id}?communityId=${communityId}`, {
          method: 'DELETE',
        });
      } catch {
        throw new Error('Unable to delete this FAQ right now.');
      }
      if (!response.ok) {
        throw new Error(await readApiError(response, 'Unable to delete this FAQ right now.'));
      }
    },
  });
}

export function useReorderFaqs(communityId: number): UseMutationResult<void, Error, number[]> {
  return useMutation<void, Error, number[]>({
    mutationFn: async (ids) => {
      // Pre-drain semantics: only network errors bubble; non-OK responses are
      // silently ignored (mobile UX shows no error feedback for reorder; the
      // component reverts local state only when fetch itself fails). Network
      // errors are normalized to a friendly literal for consistency with the
      // other hooks in this file — observable behavior is unchanged because
      // the component swallows the throw and reverts either way.
      try {
        await fetch('/api/v1/faqs/reorder', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId, ids }),
        });
      } catch {
        throw new Error('Unable to reorder FAQs right now.');
      }
    },
  });
}
