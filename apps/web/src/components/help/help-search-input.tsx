'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HelpSearchInputProps {
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function HelpSearchInput({
  defaultValue = '',
  placeholder = 'Search help articles...',
  className,
  autoFocus = false,
}: HelpSearchInputProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      router.push(`/help/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} role="search" className={cn('relative', className)}>
      <Search
        className="absolute left-4 top-1/2 -translate-y-1/2 text-content-disabled"
        size={18}
        aria-hidden="true"
      />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-[var(--radius-md)] border border-edge bg-surface-card py-3 pl-11 pr-4 text-sm text-content placeholder:text-content-placeholder transition-colors focus-visible:border-edge-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
    </form>
  );
}
