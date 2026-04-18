'use client';

import { useMemo, useState } from 'react';

interface ManageFaqItem {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
}

interface HelpFaqManageClientProps {
  communityId: number;
  initialFaqs: ManageFaqItem[];
}

export function HelpFaqManageClient({
  communityId,
  initialFaqs,
}: HelpFaqManageClientProps) {
  const [faqs, setFaqs] = useState(initialFaqs);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const editingFaq = useMemo(
    () => faqs.find((faq) => faq.id === editingId) ?? null,
    [editingId, faqs],
  );

  function resetForm() {
    setEditingId(null);
    setQuestion('');
    setAnswer('');
  }

  function startEdit(id: number) {
    const faq = faqs.find((item) => item.id === id);
    if (!faq) return;
    setErrorMessage(null);
    setEditingId(id);
    setQuestion(faq.question);
    setAnswer(faq.answer);
  }

  async function readErrorMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      return body.error?.message ?? 'Unable to save FAQ changes right now.';
    } catch {
      return 'Unable to save FAQ changes right now.';
    }
  }

  async function handleSave() {
    if (!question.trim() || !answer.trim()) return;
    setSaving(true);
    setErrorMessage(null);

    try {
      if (editingFaq) {
        const response = await fetch(`/api/v1/faqs/${editingFaq.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            communityId,
            question: question.trim(),
            answer: answer.trim(),
          }),
        });

        if (!response.ok) {
          setErrorMessage(await readErrorMessage(response));
          return;
        }

        setFaqs((current) =>
          current.map((faq) =>
            faq.id === editingFaq.id
              ? {
                  ...faq,
                  question: question.trim(),
                  answer: answer.trim(),
                }
              : faq,
          ),
        );
        resetForm();
      } else {
        const response = await fetch('/api/v1/faqs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            communityId,
            question: question.trim(),
            answer: answer.trim(),
          }),
        });
        const body = (await response.json()) as {
          data?: ManageFaqItem;
          error?: { message?: string };
        };

        if (!response.ok || !body.data) {
          setErrorMessage(body.error?.message ?? 'Unable to create this FAQ right now.');
          return;
        }

        const newFaq = body.data;
        setFaqs((current) =>
          [...current, newFaq].sort((a, b) => a.sortOrder - b.sortOrder),
        );
        resetForm();
      }
    } catch {
      setErrorMessage('Unable to save FAQ changes right now.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingFaq) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/v1/faqs/${editingFaq.id}?communityId=${communityId}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response));
        return;
      }

      setFaqs((current) => current.filter((faq) => faq.id !== editingFaq.id));
      resetForm();
    } catch {
      setErrorMessage('Unable to delete this FAQ right now.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
      <div className="overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-sm">
        {faqs.map((faq) => (
          <button
            key={faq.id}
            type="button"
            onClick={() => startEdit(faq.id)}
            className="block w-full border-b border-edge px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
          >
            <div className="text-sm font-semibold text-content">{faq.question}</div>
            <div className="mt-2 line-clamp-2 text-sm text-content-secondary">
              {faq.answer}
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-edge bg-surface-card p-5 shadow-sm">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-content">
            {editingFaq ? 'Edit FAQ' : 'Add FAQ'}
          </h2>
          <p className="text-sm text-content-secondary">
            Use short, task-focused answers that help residents and staff move quickly.
          </p>
        </div>
        <div className="mt-5 space-y-4">
          {errorMessage && (
            <div className="rounded-xl border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {errorMessage}
            </div>
          )}
          <div>
            <label htmlFor="faq-question" className="text-sm font-medium text-content">
              Question
            </label>
            <input
              id="faq-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-edge bg-surface-page px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>
          <div>
            <label htmlFor="faq-answer" className="text-sm font-medium text-content">
              Answer
            </label>
            <textarea
              id="faq-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              rows={8}
              className="mt-2 w-full rounded-xl border border-edge bg-surface-page px-3 py-2 text-sm text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving || !question.trim() || !answer.trim()}
              onClick={() => {
                void handleSave();
              }}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--interactive-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingFaq ? 'Save changes' : 'Add FAQ'}
            </button>
            {editingFaq && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  void handleDelete();
                }}
                className="inline-flex items-center justify-center rounded-xl border border-status-danger px-4 py-2 text-sm font-medium text-status-danger disabled:opacity-50"
              >
                Delete FAQ
              </button>
            )}
            {(editingFaq || question || answer) && (
              <button
                type="button"
                disabled={saving}
                onClick={resetForm}
                className="inline-flex items-center justify-center rounded-xl border border-edge px-4 py-2 text-sm font-medium text-content disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
