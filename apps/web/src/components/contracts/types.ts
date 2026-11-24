/**
 * The contracts list as `GET /api/v1/contracts` returns it (P3-52). One
 * contract's own page has its own shape: `ContractRecordData` in
 * `lib/services/contract-service.ts`.
 */

export interface Bid {
  id: number;
  vendorName: string;
  bidAmount: string;
  submittedAt: string | null;
  notes: string | null;
}

export interface BidSummary {
  bids: Bid[];
  embargoed: boolean;
  bidCount: number;
  biddingClosesAt: string | null;
}

export interface ContractRecord {
  id: number;
  title: string;
  vendorName: string;
  description: string | null;
  contractValue: string | null;
  startDate: string;
  endDate: string | null;
  documentId: number | null;
  complianceChecklistItemId: number | null;
  biddingClosesAt: string | null;
  conflictOfInterest: boolean;
  status: string;
  bidSummary: BidSummary;
}

export interface ExpirationAlert {
  contractId: number;
  title: string;
  vendorName: string;
  endDate: string;
  daysUntilExpiry: number;
  window: string;
}
