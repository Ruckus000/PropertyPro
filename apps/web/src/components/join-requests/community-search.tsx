'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface CommunitySearchResult {
  id: number;
  name: string;
  city: string | null;
  state: string | null;
  communityType: string;
  memberCount: number;
}

interface CommunitySearchProps {
  onSelect: (community: CommunitySearchResult) => void;
}

export function CommunitySearch({ onSelect }: CommunitySearchProps) {
  const [query, setQuery] = useState('');

  const { data, isLoading, isError } = useQuery<{ data: CommunitySearchResult[] }>({
    queryKey: ['community-search', query],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/public/communities/search?q=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: query.trim().length >= 2,
  });

  const results = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="community-search-input" className="block text-sm font-medium mb-2">
          Search for your community
        </label>
        <Input
          id="community-search-input"
          placeholder="Enter community name (minimum 2 characters)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
      </div>

      {query.trim().length >= 2 && (
        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Searching…</p>}
          {isError && (
            <p className="text-sm text-destructive">
              We couldn&apos;t load search results. Please try again.
            </p>
          )}
          {!isLoading && !isError && results.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No communities found. Try a different search.
            </p>
          )}
          {results.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {[c.city, c.state].filter(Boolean).join(', ') || 'Location not listed'}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">{c.communityType}</Badge>
                    {c.memberCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {c.memberCount}+ members
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSelect(c)}
                  className="shrink-0"
                >
                  Request to Join
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
