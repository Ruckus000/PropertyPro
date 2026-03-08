"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { COMPLIANCE_QUERY_KEY } from "./useComplianceChecklist";
import type { ChecklistItemData } from "@/components/compliance/compliance-checklist-item";

type PatchAction =
  | "link_document"
  | "unlink_document"
  | "mark_not_applicable"
  | "mark_applicable";

interface PatchPayload {
  id: number;
  communityId: number;
  action: PatchAction;
  documentId?: number;
}

async function patchChecklistItem(payload: PatchPayload): Promise<ChecklistItemData> {
  const res = await fetch("/api/v1/compliance", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as Record<string, string>).message ?? `PATCH failed: ${res.status}`,
    );
  }
  const json = await res.json();
  return json.data as ChecklistItemData;
}

/**
 * Optimistic mutation hooks for compliance checklist actions.
 *
 * Each mutation optimistically updates the cache and rolls back on error.
 */
export function useComplianceMutations(communityId: number) {
  const qc = useQueryClient();
  const queryKey = [COMPLIANCE_QUERY_KEY, communityId];

  async function optimisticUpdate(
    itemId: number,
    updater: (item: ChecklistItemData) => Partial<ChecklistItemData>,
  ) {
    await qc.cancelQueries({ queryKey });
    const prev = qc.getQueryData<ChecklistItemData[]>(queryKey);
    if (prev) {
      qc.setQueryData<ChecklistItemData[]>(
        queryKey,
        prev.map((item) =>
          item.id === itemId ? { ...item, ...updater(item) } : item,
        ),
      );
    }
    return { prev };
  }

  function onError(_err: Error, _vars: unknown, ctx?: { prev?: ChecklistItemData[] }) {
    if (ctx?.prev) {
      qc.setQueryData(queryKey, ctx.prev);
    }
  }

  function onSettled() {
    qc.invalidateQueries({ queryKey });
  }

  const linkDocument = useMutation({
    mutationFn: (vars: { itemId: number; documentId: number }) =>
      patchChecklistItem({
        id: vars.itemId,
        communityId,
        action: "link_document",
        documentId: vars.documentId,
      }),
    onMutate: (vars) =>
      optimisticUpdate(vars.itemId, () => ({
        documentId: vars.documentId,
        documentPostedAt: new Date().toISOString(),
        status: "satisfied" as const,
      })),
    onError,
    onSettled,
  });

  const unlinkDocument = useMutation({
    mutationFn: (vars: { itemId: number }) =>
      patchChecklistItem({ id: vars.itemId, communityId, action: "unlink_document" }),
    onMutate: (vars) =>
      optimisticUpdate(vars.itemId, () => ({
        documentId: null,
        documentPostedAt: null,
        status: "unsatisfied" as const,
      })),
    onError,
    onSettled,
  });

  const markNotApplicable = useMutation({
    mutationFn: (vars: { itemId: number }) =>
      patchChecklistItem({ id: vars.itemId, communityId, action: "mark_not_applicable" }),
    onMutate: (vars) =>
      optimisticUpdate(vars.itemId, () => ({
        isApplicable: false,
        status: "not_applicable" as const,
      })),
    onError,
    onSettled,
  });

  const markApplicable = useMutation({
    mutationFn: (vars: { itemId: number }) =>
      patchChecklistItem({ id: vars.itemId, communityId, action: "mark_applicable" }),
    onMutate: (vars) =>
      optimisticUpdate(vars.itemId, () => ({
        isApplicable: true,
        status: "unsatisfied" as const,
      })),
    onError,
    onSettled,
  });

  return { linkDocument, unlinkDocument, markNotApplicable, markApplicable };
}
