export interface ClientWorkspaceCommunity {
  id: number;
  name: string;
  slug: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  zip_code: string | null;
  address_line1: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  created_at: string;
  memberCount: number;
  documentCount: number;
  complianceScore: number | null;
}

export interface CreateClientResult {
  community: {
    id: number;
    name: string;
    slug: string;
    community_type: string;
    subscription_status: string | null;
    created_at: string;
  };
  invitationSent: boolean;
}
