import { cn } from '@/lib/utils';

interface HelpSearchInputProps {
  communityId?: number;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function HelpSearchInput({
  communityId,
  defaultValue = '',
  placeholder = 'Search guides, FAQs, and common tasks',
  className,
  autoFocus = false,
}: HelpSearchInputProps) {
  return (
    <form
      action="/help/search"
      method="GET"
      role="search"
      className={cn('rounded-2xl border border-edge bg-surface-card p-4 shadow-sm', className)}
    >
      {typeof communityId === 'number' && (
        <input type="hidden" name="communityId" value={communityId} />
      )}
      <label htmlFor="help-search" className="block text-sm font-medium text-content">
        Search the help center
      </label>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id="help-search"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="h-11 flex-1 rounded-xl border border-edge bg-surface-page px-3 text-sm text-content placeholder:text-content-disabled focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--interactive-primary)] px-4 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Search Help
        </button>
      </div>
    </form>
  );
}
