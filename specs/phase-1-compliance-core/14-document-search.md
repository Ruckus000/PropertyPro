# Spec: P1-14 — Document Search

> Implement full-text search across document content using PostgreSQL tsvector.

## Phase
1 — Compliance Core

## Priority
P1

## Dependencies
- P1-13
- P0-06

## Functional Requirements
- API endpoint GET /api/v1/documents/search with query parameter
- Uses `plainto_tsquery('english', query)` against search_vector
- Results ranked by ts_rank
- Also search document title and description as fallback
- Results scoped to current community via scoped query builder
- Results respect role-based document access rules
- Implement cursor-based pagination (default 20 results)

## Acceptance Criteria
- [ ] Searching for text inside an uploaded PDF returns the document
- [ ] Title-only search works when content search has no results
- [ ] Results are scoped to current community (cross-tenant test)
- [ ] Tenant role sees only permitted document categories
- [ ] Results are paginated with nextCursor
- [ ] `pnpm test` passes

## Technical Notes
- Add GIN index on search_vector for performance: `CREATE INDEX idx_documents_search_vector ON documents USING GIN(search_vector);`
- Union content search with title search, deduplicate results
- Rank by: ts_rank (search_vector) > title match > description match
- Include search_vector in Drizzle ORM select clause

## Files Expected
- apps/api/src/routes/documents.ts (add search endpoint)
- packages/db/src/queries/document-search.ts (search query builder)
- apps/web/src/components/document-search.tsx
- apps/api/src/__tests__/document-search.test.ts

## Attempts
0
