'use client';

import { useEffect, useRef, useState } from 'react';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useArticleFeedback,
  useSubmitArticleFeedback,
  type ArticleFeedbackRating,
} from '@/hooks/use-help';
import { cn } from '@/lib/utils';

interface ArticleFeedbackProps {
  communityId: number;
  articleSlug: string;
  articleCategory: string;
}

type Rating = ArticleFeedbackRating | null;
type SubmitState = 'idle' | 'submitting' | 'submitted' | 'error';

export function ArticleFeedback({
  communityId,
  articleSlug,
  articleCategory,
}: ArticleFeedbackProps) {
  const articleKey = `${communityId}:${articleSlug}`;
  const feedbackQuery = useArticleFeedback({ communityId, articleSlug });
  const submitFeedback = useSubmitArticleFeedback();
  const hydratedArticleKeyRef = useRef<string | null>(null);
  const [rating, setRating] = useState<Rating>(null);
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [state, setState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    hydratedArticleKeyRef.current = null;
    setRating(null);
    setComment('');
    setShowComment(false);
    setState('idle');
    setErrorMessage(null);
    setHydrated(false);
  }, [articleKey]);

  useEffect(() => {
    if (!feedbackQuery.isFetched && !feedbackQuery.isError) return;
    if (hydratedArticleKeyRef.current === articleKey) return;
    hydratedArticleKeyRef.current = articleKey;

    setRating(feedbackQuery.data?.rating ?? null);
    setComment(feedbackQuery.data?.comment ?? '');
    setHydrated(true);
  }, [articleKey, feedbackQuery.data, feedbackQuery.isError, feedbackQuery.isFetched]);

  async function submit(nextRating: 1 | -1, withComment = false): Promise<void> {
    setState('submitting');
    setErrorMessage(null);
    try {
      await submitFeedback.mutateAsync({
        communityId,
        articleSlug,
        articleCategory,
        rating: nextRating,
        comment: withComment ? comment.trim() || null : null,
      });
      setRating(nextRating);
      setState('submitted');
      // Open the comment box the first time the user reacts negatively.
      // Once opened it stays open (even if they later flip to Helpful) so a
      // draft comment isn't hidden mid-edit.
      if (nextRating === -1) {
        setShowComment(true);
      }
    } catch (error) {
      setState('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to submit feedback',
      );
    }
  }

  const alreadyRated = rating !== null;

  return (
    <section
      aria-labelledby="article-feedback-heading"
      className="rounded-[var(--radius-md)] border border-edge bg-surface-card p-5"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      <h2
        id="article-feedback-heading"
        className="text-sm font-semibold text-content"
      >
        Was this article helpful?
      </h2>
      <p className="mt-1 text-xs text-content-tertiary">
        Your feedback helps us improve help content for your community.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={rating === 1 ? 'default' : 'outline'}
          disabled={state === 'submitting'}
          onClick={() => {
            void submit(1);
          }}
          aria-pressed={rating === 1}
        >
          <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          <span className="ml-2">Helpful</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={rating === -1 ? 'default' : 'outline'}
          disabled={state === 'submitting'}
          onClick={() => {
            void submit(-1);
          }}
          aria-pressed={rating === -1}
        >
          <ThumbsDown className="h-4 w-4" aria-hidden="true" />
          <span className="ml-2">Not helpful</span>
        </Button>
      </div>

      {showComment && (
        <div className="mt-4 space-y-2">
          <label
            htmlFor="article-feedback-comment"
            className="block text-xs font-medium text-content-secondary"
          >
            What could be clearer? (optional)
          </label>
          <Textarea
            id="article-feedback-comment"
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
            }}
            maxLength={2000}
            rows={3}
            placeholder="Tell us what was missing or confusing."
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (rating !== null) {
                  void submit(rating, true);
                }
              }}
              disabled={state === 'submitting' || !comment.trim()}
            >
              Send comment
            </Button>
          </div>
        </div>
      )}

      {state === 'submitted' && (
        <p className={cn('mt-3 text-xs font-medium text-status-success')} role="status">
          Thanks — feedback saved.
        </p>
      )}

      {state === 'error' && errorMessage && (
        <p className="mt-3 text-xs font-medium text-status-danger" role="alert">
          {errorMessage}
        </p>
      )}

      {alreadyRated && state !== 'submitting' && !showComment && (
        <button
          type="button"
          onClick={() => {
            setShowComment(true);
          }}
          className="mt-3 text-xs font-medium text-[var(--interactive-primary)] underline-offset-2 hover:underline"
        >
          Add a comment
        </button>
      )}
    </section>
  );
}
