// Hand-authored until you run: npx supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
// At that point, delete this file and replace it with the generated output.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          role: 'admin' | 'internal' | 'client_athlete' | 'client_brand';
          client_id: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          email: string;
          role: 'admin' | 'internal' | 'client_athlete' | 'client_brand';
          client_id?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          type: 'athlete' | 'brand' | 'partner';
          name: string;
          sport: string | null;
          school: string | null;
          league: string | null;
          email: string;
          phone: string | null;
          social_handles: Json;
          notes: string;
          tags: string[];
          stage: 'lead' | 'in_talks' | 'contract' | 'active' | 'completed';
          deal_value: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['contacts']['Row'], 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
        Relationships: [];
      };
      deals: {
        Row: {
          id: string;
          contact_id: string;
          title: string;
          value: number;
          stage: 'lead' | 'in_talks' | 'contract' | 'active' | 'completed';
          start_date: string;
          end_date: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['deals']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['deals']['Insert']>;
        Relationships: [];
      };
      activity_logs: {
        Row: {
          id: string;
          contact_id: string;
          type: 'call' | 'email' | 'meeting' | 'note';
          summary: string;
          date: string;
          user_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['activity_logs']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['activity_logs']['Insert']>;
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          title: string;
          type: 'nil_deal' | 'game_day' | 'sponsorship' | 'season_retainer' | 'brand_activation';
          status: 'planning' | 'active' | 'in_review' | 'completed';
          start_date: string;
          end_date: string;
          description: string | null;
          tags: string[];
          deal_value: number | null;
          kpis: Json;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['campaigns']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['campaigns']['Insert']>;
        Relationships: [];
      };
      campaign_contacts: {
        Row: {
          campaign_id: string;
          contact_id: string;
        };
        Insert: Database['public']['Tables']['campaign_contacts']['Row'];
        Update: Partial<Database['public']['Tables']['campaign_contacts']['Row']>;
        Relationships: [];
      };
      deliverables: {
        Row: {
          id: string;
          campaign_id: string;
          title: string;
          type: 'video' | 'graphic' | 'copy' | 'photo';
          status: 'todo' | 'in_progress' | 'in_review' | 'approved' | 'posted';
          assignee_id: string | null;
          due_date: string;
          file_url: string | null;
          thumbnail_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['deliverables']['Row'], 'created_at'> & { created_at?: string };
        Update: Partial<Database['public']['Tables']['deliverables']['Insert']>;
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          deliverable_id: string;
          user_id: string;
          body: string;
          resolved: boolean;
          timestamp_seconds: number | null;
          pin_x: number | null;
          pin_y: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['comments']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['comments']['Insert']>;
        Relationships: [];
      };
      comment_replies: {
        Row: {
          id: string;
          comment_id: string;
          user_id: string;
          body: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['comment_replies']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['comment_replies']['Insert']>;
        Relationships: [];
      };
      automation_rules: {
        Row: {
          id: string;
          name: string;
          enabled: boolean;
          trigger_type: 'status_changed' | 'deliverable_created';
          trigger_config: Json;
          action_type: 'notify_assignee' | 'notify_team' | 'auto_assign';
          action_config: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['automation_rules']['Row'], 'id' | 'created_at' | 'enabled'> & {
          id?: string;
          created_at?: string;
          enabled?: boolean;
        };
        Update: Partial<Database['public']['Tables']['automation_rules']['Insert']>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_name: string;
          type: 'comment' | 'status_change';
          deliverable_id: string;
          deliverable_title: string;
          deliverable_type: 'video' | 'graphic' | 'copy' | 'photo';
          message: string;
          read: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at' | 'read'> & {
          id?: string;
          created_at?: string;
          read?: boolean;
        };
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: 'admin' | 'internal' | 'client_athlete' | 'client_brand';
      contact_type: 'athlete' | 'brand' | 'partner';
      pipeline_stage: 'lead' | 'in_talks' | 'contract' | 'active' | 'completed';
      campaign_type: 'nil_deal' | 'game_day' | 'sponsorship' | 'season_retainer' | 'brand_activation';
      campaign_status: 'planning' | 'active' | 'in_review' | 'completed';
      deliverable_type: 'video' | 'graphic' | 'copy' | 'photo';
      deliverable_status: 'todo' | 'in_progress' | 'in_review' | 'approved' | 'posted';
      activity_type: 'call' | 'email' | 'meeting' | 'note';
    };
  };
};
