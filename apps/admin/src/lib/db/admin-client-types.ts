import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@propertypro/db/supabase/admin';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type CommunityType = 'condo_718' | 'hoa_720' | 'apartment';
type InitialAdminRole = 'board_president' | 'board_member' | 'cam' | 'site_manager';

export interface AdminDatabase {
  public: {
    Tables: {
      communities: {
        Row: {
          id: number;
          name: string;
          slug: string;
          community_type: CommunityType;
          address_line1: string | null;
          city: string | null;
          state: string | null;
          zip_code: string | null;
          subscription_plan: string | null;
          subscription_status: string | null;
          is_demo: boolean;
          branding: Json | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: number;
          name: string;
          slug: string;
          community_type: CommunityType;
          address_line1?: string | null;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          subscription_plan?: string | null;
          subscription_status?: string | null;
          is_demo?: boolean;
          branding?: Json | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          name?: string;
          slug?: string;
          community_type?: CommunityType;
          address_line1?: string | null;
          city?: string | null;
          state?: string | null;
          zip_code?: string | null;
          subscription_plan?: string | null;
          subscription_status?: string | null;
          is_demo?: boolean;
          branding?: Json | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      compliance_items: {
        Row: {
          id: number;
          community_id: number;
          category: string;
          status: string;
          description: string | null;
        };
        Insert: {
          id?: number;
          community_id: number;
          category: string;
          status: string;
          description?: string | null;
        };
        Update: {
          community_id?: number;
          category?: string;
          status?: string;
          description?: string | null;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          user_id: string;
          community_id: number;
          role: InitialAdminRole;
        };
        Insert: {
          user_id: string;
          community_id: number;
          role: InitialAdminRole;
        };
        Update: {
          user_id?: string;
          community_id?: number;
          role?: InitialAdminRole;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export function createTypedAdminClient() {
  return createAdminClient() as unknown as SupabaseClient<AdminDatabase>;
}
