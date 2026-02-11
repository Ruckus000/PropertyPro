# ADR-001: Canonical Role Model for Community RBAC

- Status: Proposed
- Date: February 10, 2026
- Deciders: Principal Architect, Engineering Lead, Product Lead, Compliance/Legal Lead
- Scope: Role semantics, authorization model, provisioning constraints, audit requirements

## Context

PropertyPro currently contains conflicting role-model assumptions across planning docs, specs, shared contracts, and DB enum definitions.

Conflict source citations:

- Generic-role plan assumption: `/Users/jphilistin/Documents/Coding/PropertyPro/IMPLEMENTATION_PLAN.md:380`
- Generic-role P1 task text: `/Users/jphilistin/Documents/Coding/PropertyPro/IMPLEMENTATION_PLAN.md:684`
- Generic-role shared contract: `/Users/jphilistin/Documents/Coding/PropertyPro/packages/shared/src/index.ts:8`
- Generic-role DB enum: `/Users/jphilistin/Documents/Coding/PropertyPro/packages/db/src/schema/enums.ts:14`
- Domain-role requirement (resident management): `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-1-compliance-core/18-resident-management.md:17`
- Domain-role access rules (doc library): `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-1-compliance-core/25-resident-document-library.md:21`
- Domain-role provisioning requirement: `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-2-multi-tenancy/35-provisioning-pipeline.md:20`
- Domain-role RBAC audit requirement: `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-4-hardening/57-rbac-audit.md:16`

## Problem Statement

PropertyPro lacks a single canonical role model. This creates ambiguity in authorization semantics, weakens cross-tenant safety guarantees, and blocks reliable implementation and testing of role-based access control.

## Decision Drivers

- Multi-tenant isolation must be deterministic and testable.
- Access rules must be auditable for compliance.
- Community type behavior must be explicit and enforceable.
- Role semantics must be consistent across specs, shared contracts, and DB schema.
- Authorization must be enforced primarily at the DB query layer.
- Pre-production delivery speed matters, but without ambiguous policy mapping.
- Provisioning and resident management must use the same role vocabulary.
- Testing must be a release gate, not a follow-up task.

## Decision

### 1) Canonical role model (community-scoped)

`user_roles.role` uses domain roles only:

- `owner`
- `tenant`
- `board_member`
- `board_president`
- `cam`
- `site_manager`
- `property_manager_admin`

### 2) System roles

- `platform_admin` is system-scoped.
- `platform_admin` is not stored in community-scoped `user_roles`.

### 3) Auditor decision

- `auditor` is not in canonical v1 role enum.
- `auditor` is deferred to v2 and requires a concrete product use case and approved policy matrix.

### 4) Community-type constraints

| Community Type | Allowed Canonical Roles |
|---|---|
| `condo_718` | `owner`, `tenant`, `board_member`, `board_president`, `cam`, `property_manager_admin` |
| `hoa_720` | `owner`, `tenant`, `board_member`, `board_president`, `cam`, `property_manager_admin` |
| `apartment` | `tenant`, `site_manager`, `property_manager_admin` |

Constraint rules:

- Condo board and owner roles are disallowed in apartments.
- `site_manager` is disallowed in condo/HOA.
- `cam` is disallowed in apartments.

### 5) Per-community role cardinality

- v1 policy is one active canonical role per `(user_id, community_id)`.
- If a board member is also an owner, assign the board role because it inherits owner capabilities.

### 6) Unit assignment policy

| Role | Unit Assignment Policy |
|---|---|
| `owner` | Required |
| `tenant` | Required where applicable; required in apartments |
| `board_member` | Optional |
| `board_president` | Optional |
| `cam` | Optional |
| `site_manager` | Optional |
| `property_manager_admin` | Optional |

### 7) Permission profile mapping (derived, not canonical)

| Permission Profile | Canonical Role Mapping |
|---|---|
| `portfolio_admin` | `property_manager_admin` |
| `community_admin` | `board_president`, `cam`, `site_manager` |
| `community_editor` | `board_member` |
| `resident_owner` | `owner` |
| `resident_tenant` | `tenant` |

### 8) Enforcement

- Authorization is enforced at the DB query layer via a declarative policy matrix.
- API/UI checks are secondary and never primary.

### 9) Migration strategy decision

- Pre-production baseline reset is the approved path.
- No automatic legacy semantic mapping is approved as canonical policy.
- If non-test data is discovered later, a separate ADR is required for controlled migration before execution.

### 10) Testing gate

- This ADR is not implemented until role × community_type × resource tests are specified and accepted.

## Consequences

| Type | Consequence |
|---|---|
| Positive | Removes role ambiguity and creates one canonical vocabulary across platform layers. |
| Positive | Enables deterministic provisioning and access controls by community type. |
| Positive | Improves auditability by aligning policy, enforcement, and test gates. |
| Tradeoff | Requires coordinated documentation and contract/schema alignment before implementation. |
| Tradeoff | Defers `auditor` use cases to v2, which may delay audit-specific workflows. |
| Tradeoff | Enforces stricter role assignment policy that may require additional product clarifications. |

## Rejected Alternatives

| Alternative | Reason Rejected |
|---|---|
| Keep generic roles as canonical | Conflicts with domain requirements and weakens policy expressiveness for resident/document/provisioning workflows. |
| Dual-write both role systems long-term | Creates permanent semantic drift risk, increases audit complexity, and makes enforcement/testing ambiguous. |

## Rollout Gates

1. Gate 0: No-Implementation-Before-Approval. No implementation proceeds until this ADR is approved by Engineering, Product, and Compliance/Legal.
2. Gate 1: Documentation alignment complete across all listed conflict sources and contracts/enums.
3. Gate 2: Declarative role × community_type × resource policy matrix approved.
4. Gate 3: Pre-production data status verified; if non-test data exists, migration ADR is approved first.
5. Gate 4: Test specification for role × community_type × resource is accepted.
6. Gate 5: Formal cross-functional sign-off recorded.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Legacy generic-role language remains in active docs | Confused execution and inconsistent delivery | Complete doc alignment plan immediately after approval. |
| Hidden non-test data appears after baseline reset decision | Potential policy and data loss risk | Mandatory data inventory check and separate migration ADR trigger. |
| Incomplete policy matrix coverage | Authorization gaps | Require matrix approval and test spec acceptance as hard gates. |
| Drift between shared contract and DB enum | Runtime mismatch and authorization defects | Joint review of shared and DB role definitions during alignment gate. |

## Open Questions

- Does board role inheritance include every owner capability in all resources, or only specific categories?
- How should multi-unit relationships be represented when one canonical role remains required per community?
- What is the exact approval threshold for introducing `auditor` in v2?
- Which compliance artifacts must be generated from the policy matrix for audit evidence?
- What is the owner for ongoing governance of role model changes after ADR-001 approval?

## Definition of Done

- ADR-001 is approved by Engineering, Product, and Compliance/Legal.
- No conflicting generic-role assumptions remain in listed plan/spec/contract/schema documents.
- Canonical v1 role list and community constraints are documented consistently.
- `platform_admin` system scope and `auditor` deferment are documented consistently.
- Baseline reset strategy and separate-ADR trigger for non-test data are documented and acknowledged.
- Role × community_type × resource test specification is accepted.
- No-Implementation-Before-Approval gate is satisfied and formally cleared.

## Approval

| Function | Owner | Due Date | Status |
|---|---|---|---|
| Engineering | Engineering Lead | February 16, 2026 | Pending |
| Product | Product Lead | February 16, 2026 | Pending |
| Compliance/Legal | Compliance/Legal Lead | February 17, 2026 | Pending |
| Architecture Record Finalization | Principal Architect | February 17, 2026 | Pending |

---

## Execution-Ready Decision Checklist

| # | Decision Checklist Item | Owner | Due Date | Status |
|---|---|---|---|---|
| 1 | Publish ADR-001 draft to decision group | Principal Architect | February 10, 2026 | Complete |
| 2 | Enforce No-Implementation-Before-Approval freeze notice | Engineering Lead | February 10, 2026 | In Progress |
| 3 | Confirm canonical v1 community role enum | Engineering Lead | February 11, 2026 | Pending Approval |
| 4 | Confirm `platform_admin` as system-scoped only | Engineering Lead | February 11, 2026 | Pending Approval |
| 5 | Confirm `auditor` deferred to v2 pending use case + policy matrix | Product Lead | February 11, 2026 | Pending Approval |
| 6 | Approve community-type role constraints | Product Lead | February 12, 2026 | Pending Approval |
| 7 | Approve one active role per `(user_id, community_id)` policy | Engineering Lead | February 12, 2026 | Pending Approval |
| 8 | Approve board-over-owner precedence rule | Product Lead | February 12, 2026 | Pending Approval |
| 9 | Approve unit assignment policy by role/community type | Product Lead | February 12, 2026 | Pending Approval |
| 10 | Approve derived permission profile mapping | Engineering Lead | February 12, 2026 | Pending Approval |
| 11 | Approve DB-layer-primary enforcement rule | Engineering Lead | February 12, 2026 | Pending Approval |
| 12 | Approve pre-production baseline reset migration strategy | Engineering Lead | February 12, 2026 | Pending Approval |
| 13 | Complete data inventory to confirm only test/pre-production data | Engineering Lead | February 13, 2026 | Not Started |
| 14 | Define formal trigger for separate migration ADR if non-test data exists | Principal Architect | February 13, 2026 | Not Started |
| 15 | Draft role × community_type × resource policy matrix specification | Compliance Lead | February 13, 2026 | Not Started |
| 16 | Define acceptance criteria for role × community_type × resource tests | QA Lead | February 14, 2026 | Not Started |
| 17 | Validate test gate wording in hardening and compliance docs | Compliance Lead | February 14, 2026 | Not Started |
| 18 | Align implementation plan to canonical role decision | Docs Lead | February 14, 2026 | Not Started |
| 19 | Align phase specs to canonical role decision | Docs Lead | February 15, 2026 | Not Started |
| 20 | Align shared contract and DB enum documentation language | Engineering Lead | February 15, 2026 | Not Started |
| 21 | Align baseline migration narrative to approved reset strategy | Engineering Lead | February 15, 2026 | Not Started |
| 22 | Engineering sign-off recorded | Engineering Lead | February 16, 2026 | Pending |
| 23 | Product sign-off recorded | Product Lead | February 16, 2026 | Pending |
| 24 | Compliance/Legal sign-off recorded | Compliance/Legal Lead | February 17, 2026 | Pending |

---

## Doc Alignment Patch Plan

| File | Decision-Level Alignment Required |
|---|---|
| `/Users/jphilistin/Documents/Coding/PropertyPro/IMPLEMENTATION_PLAN.md` | Replace generic-role assumptions/tasks with canonical domain-role model, one-role cardinality, system-scoped `platform_admin`, deferred `auditor`, and DB-first enforcement language. |
| `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-0-foundation/05-drizzle-schema-core.md` | Define canonical v1 role enum as domain roles only, state that `platform_admin` is out-of-band from `user_roles`, and document one-role-per-community policy. |
| `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-1-compliance-core/18-resident-management.md` | Align resident management role requirements to canonical role list and community-type constraints, including board-over-owner precedence and unit assignment policy. |
| `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-1-compliance-core/25-resident-document-library.md` | Align document access rules to canonical roles and explicit role × community_type × document_category policy matrix with DB-layer-primary enforcement. |
| `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-2-multi-tenancy/35-provisioning-pipeline.md` | Align provisioning requirements so only allowed canonical roles can be assigned per community type and disallowed role/community combinations are rejected. |
| `/Users/jphilistin/Documents/Coding/PropertyPro/specs/phase-4-hardening/57-rbac-audit.md` | Align RBAC audit scope to canonical roles, community constraints, one-role cardinality, DB-layer enforcement, and test-gate acceptance requirement. |
| `/Users/jphilistin/Documents/Coding/PropertyPro/packages/shared/src/index.ts` | Align shared role contract semantics to canonical domain roles and derived permission profiles; remove generic-role terminology as canonical language. |
| `/Users/jphilistin/Documents/Coding/PropertyPro/packages/db/src/schema/enums.ts` | Align DB role enum definition to canonical v1 domain roles only and explicitly exclude `platform_admin` and deferred `auditor` from community-scoped enum. |
| `/Users/jphilistin/Documents/Coding/PropertyPro/packages/db/migrations/0000_flashy_toro.sql` | Align migration narrative to the approved pre-production baseline reset decision and document that no automatic legacy semantic mapping is canonical policy. |
