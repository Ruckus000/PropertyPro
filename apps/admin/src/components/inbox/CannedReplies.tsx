'use client';

interface CannedRepliesProps {
  replies: readonly string[];
  /** Called with the chip's text; the caller inserts it at the caret. */
  onInsert: (text: string) => void;
  disabled?: boolean;
}

/** Quick-insert chips above the reply composer — see `SUPPORT_MAILBOX_CANNED_REPLIES`. */
export function CannedReplies({ replies, onInsert, disabled }: CannedRepliesProps) {
  if (replies.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Canned replies">
      {replies.map((reply) => (
        <button
          key={reply}
          type="button"
          disabled={disabled}
          onClick={() => onInsert(reply)}
          className="min-h-9 rounded-full border border-edge-strong bg-surface-muted px-2.5 py-1 text-xs text-content-secondary hover:bg-surface-hover disabled:opacity-60 md:min-h-0"
        >
          {reply}
        </button>
      ))}
    </div>
  );
}
