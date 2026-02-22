/**
 * Shared types for the contracts feature (P3-52).
 * Single source of truth imported by ContractTable, BidTracker, and ContractForm.
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
