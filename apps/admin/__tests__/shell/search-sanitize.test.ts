import { describe, expect, it } from 'vitest';
import { sanitizeSearchTerm } from '@/lib/server/search/sanitize';

describe('sanitizeSearchTerm', () => {
  it('strips the ILIKE single-character wildcard so it cannot widen a match', () => {
    // `_` is Postgres's ILIKE single-character wildcard. Left unstripped,
    // the pattern built from "john_doe" would be `%john_doe%`, which also
    // matches `johnXdoe` — a row the literal term never asked for.
    expect(sanitizeSearchTerm('john_doe')).toBe('john doe');
    expect(sanitizeSearchTerm('john_doe')).not.toContain('_');
  });

  it('reduces a term of only stripped characters to empty, not to a %% wildcard', () => {
    // Each of these clears a naive "at least 2 characters" check but is
    // nothing PostgREST/Postgres can search on. A caller that skips the
    // emptiness check and interpolates the result into `%<term>%` gets the
    // pattern `%%`, which matches every row up to the query's limit.
    expect(sanitizeSearchTerm('%%')).toBe('');
    expect(sanitizeSearchTerm('()')).toBe('');
    expect(sanitizeSearchTerm(',,')).toBe('');
    expect(sanitizeSearchTerm('__')).toBe('');
  });

  it('leaves an ordinary term untouched', () => {
    expect(sanitizeSearchTerm('Sunset Condos')).toBe('Sunset Condos');
  });
});
