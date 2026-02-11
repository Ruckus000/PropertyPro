# Spec: P0-05 — Drizzle Schema Core

> Define the Drizzle ORM schema for all core database tables with the community_type enum.

## Phase
0 — Foundation

## Priority
P0 — Must Have

## Dependencies
- P0-04

## Functional Requirements
- Define communities table with community_type enum (condo_718, hoa_720, apartment), timezone (default America/New_York), subdomain, branding fields (logo_url, primary_color, secondary_color)
- Define users table with email, first_name, last_name, avatar_url, created_at, updated_at, deleted_at
- Define user_roles table with user_id FK, community_id FK, role enum (owner, tenant, board_member, board_president, cam, site_manager, property_manager_admin), unit_id FK (nullable for non-unit-based roles). Note: platform_admin is system-scoped (not in user_roles); auditor deferred to v2 per ADR-001. Enforce one active role per (user_id, community_id). Validate role against community_type constraints per ADR-001.
- Define units table with community_id FK, unit_number, property_address, parking_spots (condo-specific, default 0), storage_units (condo-specific, default 0), voting_share (condo-specific, default 1.0), rent_amount (apartment-specific, nullable), availability_date (apartment-specific, nullable)
- Define document_categories table with community_id FK, name, icon, display_order
- Define documents table with community_id FK, category_id FK, title, description, file_url, search_text, search_vector (tsvector for full-text search), uploaded_by user_id FK, created_at, updated_at (no deleted_at — preserve all document history)
- Define notification_preferences table with user_id FK, community_id FK, email_frequency (immediate, daily, weekly, never), in_app_enabled (boolean)
- Define a TypeScript enum for all role types and export from packages/db
- Set all tables to use BIGINT for IDs with auto-increment
- All tables include community_id FK, created_at, updated_at (UTC timestamps)
- Enable soft-delete (deleted_at) on appropriate tables (users, user_roles, units, documents)
- Generate and run initial migration

## Acceptance Criteria
- [ ] `pnpm db:generate` creates migration files without errors
- [ ] `pnpm db:migrate` applies migration to Supabase successfully
- [ ] All tables exist in the database with correct columns and types
- [ ] community_type enum enforces valid values (condo_718, hoa_720, apartment)
- [ ] user_roles enum enforces canonical v1 values (owner, tenant, board_member, board_president, cam, site_manager, property_manager_admin) per ADR-001
- [ ] All timestamps are stored in UTC (type: timestamp with time zone)
- [ ] Foreign keys have proper ON DELETE CASCADE/SET NULL behavior
- [ ] TypeScript types are generated and exported from packages/db
- [ ] `pnpm typecheck` passes
- [ ] Database schema is documented in packages/db/src/schema/README.md

## Technical Notes
- Use postgres-js driver, not node-postgres.
- community_id is on EVERY table as FK — enforce at database level.
- Store all dates as UTC. Use timezone-aware timestamp columns (timestamp with time zone).
- compliance_audit_log table (created in later phase) is append-only — no deleted_at.
- Enable full-text search on documents via search_vector tsvector column.
- Consider indexes on common queries (documents by community, users by community, units by community).
- Soft-deletes via deleted_at allow data recovery; use IS NULL filters in queries.

## Files Expected
- packages/db/src/schema/communities.ts
- packages/db/src/schema/users.ts
- packages/db/src/schema/user-roles.ts
- packages/db/src/schema/units.ts
- packages/db/src/schema/documents.ts
- packages/db/src/schema/notification-preferences.ts
- packages/db/src/schema/enums.ts
- packages/db/src/schema/index.ts
- packages/db/drizzle.config.ts
- packages/db/migrations/0001_initial_schema.sql
- packages/db/src/schema/README.md (documentation)

## Attempts
0
