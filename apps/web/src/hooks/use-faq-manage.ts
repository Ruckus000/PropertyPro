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

// Documented exception to the requestJson rule: each mutation throws bespoke
// per-operation error literals ('Unable to save FAQ changes right now.' for
// PATCH/DELETE fallback, 'Unable to create this FAQ right now.' for POST
// fallback) that the component renders verbatim in an inline error banner;
// the POST path also rejects 200 responses with missing `data`. requestJson's
// generic 'Request failed' fallback would not match. Raw fetch + readApiError
// preserve byte-for-byte.
async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? 'Unable to save FAQ changes right now.';
  } catch {
    return 'Unable to save FAQ changes right now.';
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
      const response = await fetch(`/api/v1/faqs/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, question, answer }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
    },
  });
}

export function useCreateFaq(communityId: number): UseMutationResult<ManageFaqItem, Error, CreateFaqInput> {
  return useMutation<ManageFaqItem, Error, CreateFaqInput>({
    mutationFn: async ({ question, answer }) => {
      const response = await fetch('/api/v1/faqs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, question, answer }),
      });
      const body = (await response.json()) as ApiErrorBody;
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
      const response = await fetch(`/api/v1/faqs/${id}?communityId=${communityId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readApiError(response));
      }
    },
  });
}
