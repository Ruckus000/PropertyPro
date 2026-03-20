"use client";

import { useState, useCallback } from "react";
import {
  ChevronUp,
  ChevronDown,
  Pencil,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileBackHeader } from "@/components/mobile/MobileBackHeader";
import { PageTransition, SlideUp } from "@/components/motion";

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
}

interface MobileFaqManageContentProps {
  initialFaqs: FaqItem[];
  communityId: number;
}

export function MobileFaqManageContent({
  initialFaqs,
  communityId,
}: MobileFaqManageContentProps) {
  const [faqs, setFaqs] = useState<FaqItem[]>(initialFaqs);
  const [editingFaq, setEditingFaq] = useState<FaqItem | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [saving, setSaving] = useState(false);

  // Sheet form state
  const [sheetQuestion, setSheetQuestion] = useState("");
  const [sheetAnswer, setSheetAnswer] = useState("");

  function openEdit(faq: FaqItem) {
    setEditingFaq(faq);
    setIsAdding(false);
    setSheetQuestion(faq.question);
    setSheetAnswer(faq.answer);
  }

  function openAdd() {
    setEditingFaq(null);
    setIsAdding(true);
    setSheetQuestion("");
    setSheetAnswer("");
  }

  function closeSheet() {
    setEditingFaq(null);
    setIsAdding(false);
    setSheetQuestion("");
    setSheetAnswer("");
  }

  const handleReorder = useCallback(
    async (index: number, direction: "up" | "down") => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= faqs.length) return;

      const newFaqs = [...faqs];
      const temp = newFaqs[index]!;
      newFaqs[index] = newFaqs[targetIndex]!;
      newFaqs[targetIndex] = temp;

      setFaqs(newFaqs);
      setReorderAnnouncement(
        `FAQ moved to position ${targetIndex + 1} of ${newFaqs.length}`,
      );

      try {
        await fetch("/api/v1/faqs/reorder", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            communityId,
            ids: newFaqs.map((f) => f.id),
          }),
        });
      } catch {
        // Revert on failure
        setFaqs(faqs);
      }
    },
    [faqs, communityId],
  );

  async function handleSave() {
    if (!sheetQuestion.trim() || !sheetAnswer.trim()) return;
    setSaving(true);

    try {
      if (isAdding) {
        const res = await fetch("/api/v1/faqs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            communityId,
            question: sheetQuestion.trim(),
            answer: sheetAnswer.trim(),
          }),
        });
        const json = await res.json();
        if (res.ok && json.data) {
          const newFaq: FaqItem = {
            id: json.data.id as number,
            question: json.data.question as string,
            answer: json.data.answer as string,
            sortOrder: json.data.sortOrder as number,
          };
          setFaqs((prev) => [...prev, newFaq]);
        }
      } else if (editingFaq) {
        const res = await fetch(`/api/v1/faqs/${editingFaq.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            communityId,
            question: sheetQuestion.trim(),
            answer: sheetAnswer.trim(),
          }),
        });
        if (res.ok) {
          setFaqs((prev) =>
            prev.map((f) =>
              f.id === editingFaq.id
                ? {
                    ...f,
                    question: sheetQuestion.trim(),
                    answer: sheetAnswer.trim(),
                  }
                : f,
            ),
          );
        }
      }
      closeSheet();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingFaq) return;
    if (!window.confirm("Delete this question?")) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/faqs/${editingFaq.id}?communityId=${communityId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setFaqs((prev) => prev.filter((f) => f.id !== editingFaq.id));
        closeSheet();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition>
      <MobileBackHeader title="Manage FAQs" />

      <div aria-live="polite" className="sr-only">
        {reorderAnnouncement}
      </div>

      <div className="px-5 py-4">
        {/* FAQ list */}
        <SlideUp>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-stone-400">
            Questions ({faqs.length})
          </div>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            {faqs.map((faq, i) => (
              <div
                key={faq.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-3",
                  i < faqs.length - 1 && "border-b border-stone-100",
                )}
              >
                {/* Reorder buttons */}
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    onClick={() => handleReorder(i, "up")}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="flex h-[22px] w-[22px] items-center justify-center rounded text-stone-400 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                  >
                    <ChevronUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleReorder(i, "down")}
                    disabled={i === faqs.length - 1}
                    aria-label="Move down"
                    className="flex h-[22px] w-[22px] items-center justify-center rounded text-stone-400 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </div>

                {/* Question text */}
                <span className="flex-1 truncate text-[15px] font-medium text-stone-900">
                  {faq.question}
                </span>

                {/* Edit button */}
                <button
                  onClick={() => openEdit(faq)}
                  aria-label={`Edit: ${faq.question}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                >
                  <Pencil
                    size={16}
                    className="text-stone-400"
                    aria-hidden="true"
                  />
                </button>
              </div>
            ))}
            {faqs.length === 0 && (
              <div className="px-4 py-8 text-center text-[14px] text-stone-400">
                No FAQs yet. Add one below.
              </div>
            )}
          </div>
        </SlideUp>

        {/* Add button */}
        <SlideUp delay={0.05}>
          <button
            onClick={openAdd}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-white py-3.5 text-[15px] font-medium text-stone-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
          >
            <Plus size={18} aria-hidden="true" />
            Add Question
          </button>
        </SlideUp>
      </div>

      {/* Edit / Add sheet */}
      {(editingFaq || isAdding) && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeSheet}
            aria-hidden="true"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-auto rounded-t-2xl bg-white p-5 pb-8">
            <h2 className="mb-4 text-lg font-semibold text-stone-900">
              {isAdding ? "Add Question" : "Edit Question"}
            </h2>

            <label className="mb-1 block text-[13px] font-medium text-stone-500">
              Question
            </label>
            <input
              type="text"
              value={sheetQuestion}
              onChange={(e) => setSheetQuestion(e.target.value)}
              placeholder="Enter the question..."
              className="mb-4 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-[15px] text-stone-900 placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            />

            <label className="mb-1 block text-[13px] font-medium text-stone-500">
              Answer
            </label>
            <textarea
              value={sheetAnswer}
              onChange={(e) => setSheetAnswer(e.target.value)}
              placeholder="Enter the answer..."
              rows={4}
              className="mb-4 w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-[15px] text-stone-900 placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            />

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !sheetQuestion.trim() || !sheetAnswer.trim()}
                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-stone-900 text-[15px] font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={closeSheet}
                disabled={saving}
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-stone-200 bg-white text-[15px] font-medium text-stone-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2"
              >
                Cancel
              </button>
            </div>

            {editingFaq && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="mt-3 w-full text-center text-[15px] text-red-600 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                Delete Question
              </button>
            )}
          </div>
        </div>
      )}
    </PageTransition>
  );
}
