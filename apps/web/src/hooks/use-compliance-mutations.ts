"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { COMPLIANCE_QUERY_KEY } from "./use-compliance-checklist";
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
  /** Required by the route for `mark_not_applicable`. */
  reason?: string;
  /** `link_document` only: replace the record's current file on purpose. */
  replace?: boolean;
}

async function patchChecklistItem(payload: PatchPayload): Promise<ChecklistItemData> {
  const res = await fetch("/api/v1/compliance", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    // The error envelope is `{ error: { message } }`; an older shape put
    // `message` at the top level. Either way the person sees the sentence the
    // server wrote ("This file is already posted as another record.").
    const err = (await res.json().catch(() => ({}))) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const message =
      typeof err.error?.message === "string"
        ? err.error.message
        : typeof err.message === "string"
          ? err.message
          : `PATCH failed: ${res.status}`;
    throw new Error(message);
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

  function optimisticUpdate(
    itemId: number,
    updater: (item: ChecklistItemData) => Partial<ChecklistItemData>,
  ) {
    qc.cancelQueries({ queryKey });
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

  // `replace`: only the Compliance page's re-link flow sends it. Without it the
  // route refuses (409) to swap a record's file, or to give one file to two records.
  const linkDocument = useMutation({
    mutationFn: (vars: { itemId: number; documentId: number; replace?: boolean }) =>
      patchChecklistItem({
        id: vars.itemId,
        communityId,
        action: "link_document",
        documentId: vars.documentId,
        ...(vars.replace ? { replace: true } : {}),
      }),
    onMutate: (vars) =>
      optimisticUpdate(vars.itemId, () => ({
        documentId: vars.documentId,
        documentPostedAt: new Date().toISOString(),
        status: "satisfied" as const,
      })),
    onError,
    onSuccess: () => toast.success("Document linked."),
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
    onSuccess: () => toast.success("Document unlinked."),
    onSettled,
  });

  const markNotApplicable = useMutation({
    mutationFn: (vars: { itemId: number; reason: string }) =>
      patchChecklistItem({
        id: vars.itemId,
        communityId,
        action: "mark_not_applicable",
        reason: vars.reason,
      }),
    onMutate: (vars) =>
      optimisticUpdate(vars.itemId, () => ({
        isApplicable: false,
        notApplicableReason: vars.reason,
        status: "not_applicable" as const,
      })),
    onError,
    onSuccess: () => toast.success("Marked as not applicable."),
    onSettled,
  });

  const markApplicable = useMutation({
    mutationFn: (vars: { itemId: number }) =>
      patchChecklistItem({ id: vars.itemId, communityId, action: "mark_applicable" }),
    onMutate: (vars) =>
      optimisticUpdate(vars.itemId, () => ({
        isApplicable: true,
        notApplicableReason: null,
        status: "unsatisfied" as const,
      })),
    onError,
    onSuccess: () => toast.success("Marked as applicable."),
    onSettled,
  });

  return { linkDocument, unlinkDocument, markNotApplicable, markApplicable };
}
