# Spec: P3-52 — Contract & Vendor Tracking

> Build contract and vendor tracking for condo/HOA statutory requirements with expiration alerts.

## Phase
3

## Priority
P1

## Dependencies
- P0-05
- P0-06

## Functional Requirements
- Contracts table: vendor name, contract type, start/end dates, value, linked document
- List of executory contracts (statutory requirement for condos)
- Expiration alerts at 30/60/90 days
- Bid tracking: bids visible only after bidding closes
- Conflict-of-interest flagging capability
- Only available for condo_718 and hoa_720
- Links to compliance checklist items

## Acceptance Criteria
- [ ] Contract created and linked to document
- [ ] Expiration alerts trigger at correct thresholds
- [ ] Bids hidden until bidding close date
- [ ] Contract tracking hidden for apartments
- [ ] `pnpm test` passes

## Technical Notes
- Use scheduled tasks or database triggers to check expirations daily
- Store document_id as foreign key to link to uploaded documents
- Implement audit trail for contract modifications (tracks who modified what and when)
- Consider email alerts for approaching expirations

## Files Expected
- `apps/web/src/app/(authenticated)/contracts/page.tsx`
- `apps/web/src/components/contracts/ContractForm.tsx`
- `apps/web/src/components/contracts/ContractTable.tsx`
- `apps/web/src/components/contracts/BidTracker.tsx`
- `apps/web/src/lib/api/contracts.ts`
- `apps/web/src/lib/services/contract-renewal-alerts.ts`

## Attempts
0
