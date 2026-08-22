export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          payload: Json | null
          pharmacy_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          payload?: Json | null
          pharmacy_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          payload?: Json | null
          pharmacy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_active_sessions"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_activity_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_ai_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_daily_sales"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_expiring_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_new_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_shop_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_tenants_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_override_requests: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          pharmacy_id: string
          reason: string | null
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          pharmacy_id: string
          reason?: string | null
          requested_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          pharmacy_id?: string
          reason?: string | null
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          pharmacy_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pharmacy_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pharmacy_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          direction: string
          id: string
          note: string | null
          occurred_at: string
          party_name: string | null
          pharmacy_id: string
          sale_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          direction: string
          id?: string
          note?: string | null
          occurred_at?: string
          party_name?: string | null
          pharmacy_id: string
          sale_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          direction?: string
          id?: string
          note?: string | null
          occurred_at?: string
          party_name?: string | null
          pharmacy_id?: string
          sale_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          content: string | null
          created_at: string
          edited_at: string | null
          id: string
          pharmacy_id: string
          room_id: string
          sender_id: string
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          pharmacy_id: string
          room_id: string
          sender_id: string
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          pharmacy_id?: string
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_room_members: {
        Row: {
          is_admin: boolean
          joined_at: string
          last_read_at: string
          room_id: string
          user_id: string
        }
        Insert: {
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string
          room_id: string
          user_id: string
        }
        Update: {
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          id: string
          name: string | null
          pharmacy_id: string
          type: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          name?: string | null
          pharmacy_id: string
          type: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string | null
          pharmacy_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          name: string
          pharmacy_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          pharmacy_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          pharmacy_id?: string
        }
        Relationships: []
      }
      customer_dues: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          customer_name: string | null
          id: string
          pharmacy_id: string
          sale_id: string | null
          updated_at: string
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          customer_name?: string | null
          id?: string
          pharmacy_id: string
          sale_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          customer_name?: string | null
          id?: string
          pharmacy_id?: string
          sale_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_ledger: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          description: string | null
          entry_type: string
          id: string
          occurred_at: string
          pharmacy_id: string
          sale_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          description?: string | null
          entry_type: string
          id?: string
          occurred_at?: string
          pharmacy_id: string
          sale_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          entry_type?: string
          id?: string
          occurred_at?: string
          pharmacy_id?: string
          sale_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_prescriptions: {
        Row: {
          created_at: string
          customer_id: string
          dosage_frequency: string
          dosage_timing: string | null
          id: string
          medicine_id: string | null
          medicine_name: string
          notes: string | null
          pharmacy_id: string
          strength: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          dosage_frequency: string
          dosage_timing?: string | null
          id?: string
          medicine_id?: string | null
          medicine_name: string
          notes?: string | null
          pharmacy_id: string
          strength?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          dosage_frequency?: string
          dosage_timing?: string | null
          id?: string
          medicine_id?: string | null
          medicine_name?: string
          notes?: string | null
          pharmacy_id?: string
          strength?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_prescriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          pharmacy_id: string
          phone: string | null
          total_due: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          pharmacy_id: string
          phone?: string | null
          total_due?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          pharmacy_id?: string
          phone?: string | null
          total_due?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_closings: {
        Row: {
          closed_at: string
          closed_by_user_id: string | null
          closing_date: string
          closing_type: string
          created_at: string
          declared_cash: number | null
          discrepancy: number | null
          id: string
          net_balance: number
          notes: string | null
          pharmacy_id: string
          starting_balance: number
          system_cash: number | null
          total_cash_in: number
          total_due: number
          total_payments: number
          total_sales: number
        }
        Insert: {
          closed_at?: string
          closed_by_user_id?: string | null
          closing_date: string
          closing_type?: string
          created_at?: string
          declared_cash?: number | null
          discrepancy?: number | null
          id?: string
          net_balance?: number
          notes?: string | null
          pharmacy_id: string
          starting_balance?: number
          system_cash?: number | null
          total_cash_in?: number
          total_due?: number
          total_payments?: number
          total_sales?: number
        }
        Update: {
          closed_at?: string
          closed_by_user_id?: string | null
          closing_date?: string
          closing_type?: string
          created_at?: string
          declared_cash?: number | null
          discrepancy?: number | null
          id?: string
          net_balance?: number
          notes?: string | null
          pharmacy_id?: string
          starting_balance?: number
          system_cash?: number | null
          total_cash_in?: number
          total_due?: number
          total_payments?: number
          total_sales?: number
        }
        Relationships: []
      }
      master_medicines: {
        Row: {
          box_size: string | null
          brand_name: string
          company: string | null
          created_at: string | null
          format: string | null
          generic_name: string | null
          id: string
          last_synced_at: string | null
          pack_size: string | null
          pcs_per_strip: number | null
          search_vector: unknown
          strength: string | null
          strip_per_pack: number | null
          unit_price: number | null
        }
        Insert: {
          box_size?: string | null
          brand_name: string
          company?: string | null
          created_at?: string | null
          format?: string | null
          generic_name?: string | null
          id?: string
          last_synced_at?: string | null
          pack_size?: string | null
          pcs_per_strip?: number | null
          search_vector?: unknown
          strength?: string | null
          strip_per_pack?: number | null
          unit_price?: number | null
        }
        Update: {
          box_size?: string | null
          brand_name?: string
          company?: string | null
          created_at?: string | null
          format?: string | null
          generic_name?: string | null
          id?: string
          last_synced_at?: string | null
          pack_size?: string | null
          pcs_per_strip?: number | null
          search_vector?: unknown
          strength?: string | null
          strip_per_pack?: number | null
          unit_price?: number | null
        }
        Relationships: []
      }
      master_medicines_import: {
        Row: {
          brand_name: string
          company: string | null
          fetched_at: string
          format: string | null
          generic: string | null
          id: string
          pack_size: string | null
          price: number | null
          source: string
          source_id: string | null
          strength: string | null
        }
        Insert: {
          brand_name: string
          company?: string | null
          fetched_at?: string
          format?: string | null
          generic?: string | null
          id?: string
          pack_size?: string | null
          price?: number | null
          source?: string
          source_id?: string | null
          strength?: string | null
        }
        Update: {
          brand_name?: string
          company?: string | null
          fetched_at?: string
          format?: string | null
          generic?: string | null
          id?: string
          pack_size?: string | null
          price?: number | null
          source?: string
          source_id?: string | null
          strength?: string | null
        }
        Relationships: []
      }
      medicine_sync_queue: {
        Row: {
          brand_name: string
          company: string | null
          decided_at: string | null
          detected_at: string
          duplicate_match: Json | null
          format: string | null
          generic: string | null
          id: string
          kind: string
          master_id: string | null
          payload: Json
          payload_hash: string | null
          price: number | null
          rejected_at: string | null
          status: string
          strength: string | null
          suppressed_until: string | null
        }
        Insert: {
          brand_name: string
          company?: string | null
          decided_at?: string | null
          detected_at?: string
          duplicate_match?: Json | null
          format?: string | null
          generic?: string | null
          id?: string
          kind: string
          master_id?: string | null
          payload?: Json
          payload_hash?: string | null
          price?: number | null
          rejected_at?: string | null
          status?: string
          strength?: string | null
          suppressed_until?: string | null
        }
        Update: {
          brand_name?: string
          company?: string | null
          decided_at?: string | null
          detected_at?: string
          duplicate_match?: Json | null
          format?: string | null
          generic?: string | null
          id?: string
          kind?: string
          master_id?: string | null
          payload?: Json
          payload_hash?: string | null
          price?: number | null
          rejected_at?: string | null
          status?: string
          strength?: string | null
          suppressed_until?: string | null
        }
        Relationships: []
      }
      medicine_sync_runs: {
        Row: {
          duration_ms: number
          id: string
          items_scanned: number
          note: string | null
          started_at: string
          trigger: string
          verified: Json
        }
        Insert: {
          duration_ms?: number
          id?: string
          items_scanned?: number
          note?: string | null
          started_at?: string
          trigger?: string
          verified?: Json
        }
        Update: {
          duration_ms?: number
          id?: string
          items_scanned?: number
          note?: string | null
          started_at?: string
          trigger?: string
          verified?: Json
        }
        Relationships: []
      }
      medicines: {
        Row: {
          box_size: string | null
          company_name: string | null
          created_at: string | null
          expiry_date: string | null
          format: string | null
          generic_name: string | null
          id: string
          name: string
          pack_size: string | null
          packaging_type: string | null
          pcs_per_strip: number | null
          pharmacy_id: string
          price: number | null
          product_size: string | null
          product_type: string | null
          stock_alert: number | null
          stock_quantity: number | null
          strength: string | null
          strip_per_pack: number | null
          unit_format: string | null
        }
        Insert: {
          box_size?: string | null
          company_name?: string | null
          created_at?: string | null
          expiry_date?: string | null
          format?: string | null
          generic_name?: string | null
          id?: string
          name: string
          pack_size?: string | null
          packaging_type?: string | null
          pcs_per_strip?: number | null
          pharmacy_id: string
          price?: number | null
          product_size?: string | null
          product_type?: string | null
          stock_alert?: number | null
          stock_quantity?: number | null
          strength?: string | null
          strip_per_pack?: number | null
          unit_format?: string | null
        }
        Update: {
          box_size?: string | null
          company_name?: string | null
          created_at?: string | null
          expiry_date?: string | null
          format?: string | null
          generic_name?: string | null
          id?: string
          name?: string
          pack_size?: string | null
          packaging_type?: string | null
          pcs_per_strip?: number | null
          pharmacy_id?: string
          price?: number | null
          product_size?: string | null
          product_type?: string | null
          stock_alert?: number | null
          stock_quantity?: number | null
          strength?: string | null
          strip_per_pack?: number | null
          unit_format?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_active_sessions"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_activity_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_ai_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_daily_sales"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_expiring_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_new_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_shop_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_tenants_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          color: string
          contact_numbers: string[]
          content: Json
          created_at: string
          creator_id: string
          id: string
          image_metadata: Json
          is_pinned: boolean
          is_public: boolean
          pharmacy_id: string
          tags: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          contact_numbers?: string[]
          content?: Json
          created_at?: string
          creator_id: string
          id?: string
          image_metadata?: Json
          is_pinned?: boolean
          is_public?: boolean
          pharmacy_id: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          contact_numbers?: string[]
          content?: Json
          created_at?: string
          creator_id?: string
          id?: string
          image_metadata?: Json
          is_pinned?: boolean
          is_public?: boolean
          pharmacy_id?: string
          tags?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pharmacies: {
        Row: {
          address: string | null
          cover_url: string | null
          created_at: string | null
          default_discount: number | null
          demo_expires_at: string | null
          district: string | null
          division: string | null
          drug_license: string | null
          email: string | null
          id: string
          invoice_footer: string | null
          is_demo: boolean
          is_suspended: boolean
          last_popup_shown: string | null
          logo_url: string | null
          name: string
          phone: string | null
          proprietor_name: string | null
          subscription_expiry: string | null
          subscription_plan: string | null
          subscription_started_at: string | null
          suspend_reason: string | null
          suspended_at: string | null
          trade_license: string | null
          upazila: string | null
        }
        Insert: {
          address?: string | null
          cover_url?: string | null
          created_at?: string | null
          default_discount?: number | null
          demo_expires_at?: string | null
          district?: string | null
          division?: string | null
          drug_license?: string | null
          email?: string | null
          id?: string
          invoice_footer?: string | null
          is_demo?: boolean
          is_suspended?: boolean
          last_popup_shown?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          proprietor_name?: string | null
          subscription_expiry?: string | null
          subscription_plan?: string | null
          subscription_started_at?: string | null
          suspend_reason?: string | null
          suspended_at?: string | null
          trade_license?: string | null
          upazila?: string | null
        }
        Update: {
          address?: string | null
          cover_url?: string | null
          created_at?: string | null
          default_discount?: number | null
          demo_expires_at?: string | null
          district?: string | null
          division?: string | null
          drug_license?: string | null
          email?: string | null
          id?: string
          invoice_footer?: string | null
          is_demo?: boolean
          is_suspended?: boolean
          last_popup_shown?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          proprietor_name?: string | null
          subscription_expiry?: string | null
          subscription_plan?: string | null
          subscription_started_at?: string | null
          suspend_reason?: string | null
          suspended_at?: string | null
          trade_license?: string | null
          upazila?: string | null
        }
        Relationships: []
      }
      pharmacy_broadcasts: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          is_urgent: boolean
          message: string
          pharmacy_id: string
          target_type: string
          target_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          is_urgent?: boolean
          message: string
          pharmacy_id: string
          target_type?: string
          target_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          is_urgent?: boolean
          message?: string
          pharmacy_id?: string
          target_type?: string
          target_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pharmacy_settings: {
        Row: {
          pharmacy_id: string
          starting_cash_balance: number
          updated_at: string
        }
        Insert: {
          pharmacy_id: string
          starting_cash_balance?: number
          updated_at?: string
        }
        Update: {
          pharmacy_id?: string
          starting_cash_balance?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_targets: {
        Row: {
          achieved_at: string | null
          created_at: string
          created_by: string
          current_progress: number
          id: string
          incentive_description: string
          medicine_id: string
          medicine_name: string
          pharmacy_id: string
          target_month: string
          target_quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string
          created_by: string
          current_progress?: number
          id?: string
          incentive_description: string
          medicine_id: string
          medicine_name: string
          pharmacy_id: string
          target_month: string
          target_quantity: number
          updated_at?: string
          user_id: string
        }
        Update: {
          achieved_at?: string | null
          created_at?: string
          created_by?: string
          current_progress?: number
          id?: string
          incentive_description?: string
          medicine_id?: string
          medicine_name?: string
          pharmacy_id?: string
          target_month?: string
          target_quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          is_demo: boolean
          last_seen: string | null
          last_trial_popup_date: string | null
          pharmacy_id: string | null
          phone: string | null
          role: string | null
          terms_accepted: boolean
          terms_accepted_at: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          is_demo?: boolean
          last_seen?: string | null
          last_trial_popup_date?: string | null
          pharmacy_id?: string | null
          phone?: string | null
          role?: string | null
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          is_demo?: boolean
          last_seen?: string | null
          last_trial_popup_date?: string | null
          pharmacy_id?: string | null
          phone?: string | null
          role?: string | null
          terms_accepted?: boolean
          terms_accepted_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_active_sessions"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_activity_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_ai_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_daily_sales"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_expiring_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_new_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_shop_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_tenants_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_attempts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          ip_hash: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          ip_hash: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          ip_hash?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          company_name: string | null
          created_at: string
          discount_percent: number
          id: string
          medicine_id: string
          medicine_name: string
          quantity: number
          sale_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          discount_percent?: number
          id?: string
          medicine_id: string
          medicine_name: string
          quantity?: number
          sale_id: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          company_name?: string | null
          created_at?: string
          discount_percent?: number
          id?: string
          medicine_id?: string
          medicine_name?: string
          quantity?: number
          sale_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          discount_amount: number
          discount_percent: number
          id: string
          pharmacy_id: string
          sale_type: string
          status: string
          subtotal: number
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          pharmacy_id: string
          sale_type?: string
          status?: string
          subtotal?: number
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          discount_amount?: number
          discount_percent?: number
          id?: string
          pharmacy_id?: string
          sale_type?: string
          status?: string
          subtotal?: number
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      shop_feature_flags: {
        Row: {
          enabled: boolean
          flag_key: string
          id: string
          pharmacy_id: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          flag_key: string
          id?: string
          pharmacy_id: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          flag_key?: string
          id?: string
          pharmacy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_active_sessions"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_activity_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_ai_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_daily_sales"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_expiring_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_new_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_shop_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_tenants_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_feature_flags_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_staff: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          pharmacy_id: string
          role: string
          status: string
          token: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          pharmacy_id: string
          role?: string
          status?: string
          token?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          pharmacy_id?: string
          role?: string
          status?: string
          token?: string
          user_id?: string | null
        }
        Relationships: []
      }
      staff_access: {
        Row: {
          created_at: string
          id: string
          is_suspended: boolean
          pharmacy_id: string
          suspend_reason: string | null
          suspended_at: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          pharmacy_id: string
          suspend_reason?: string | null
          suspended_at?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_suspended?: boolean
          pharmacy_id?: string
          suspend_reason?: string | null
          suspended_at?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_activity_logs: {
        Row: {
          action_type: string
          amount: number | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
          pharmacy_id: string
          severity: string
          user_id: string
        }
        Insert: {
          action_type: string
          amount?: number | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          pharmacy_id: string
          severity?: string
          user_id: string
        }
        Update: {
          action_type?: string
          amount?: number | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
          pharmacy_id?: string
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          permission_key: string
          pharmacy_id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission_key: string
          pharmacy_id: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          permission_key?: string
          pharmacy_id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      staff_pins: {
        Row: {
          failures: number
          locked_until: string | null
          pharmacy_id: string
          pin_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          failures?: number
          locked_until?: string | null
          pharmacy_id: string
          pin_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          failures?: number
          locked_until?: string | null
          pharmacy_id?: string
          pin_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_security_settings: {
        Row: {
          allowed_ip_hashes: string[]
          grace_seconds: number
          ip_restriction_enabled: boolean
          pharmacy_id: string
          pin_lock_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_ip_hashes?: string[]
          grace_seconds?: number
          ip_restriction_enabled?: boolean
          pharmacy_id: string
          pin_lock_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_ip_hashes?: string[]
          grace_seconds?: number
          ip_restriction_enabled?: boolean
          pharmacy_id?: string
          pin_lock_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff_sessions: {
        Row: {
          browser: string | null
          device_type: string | null
          first_seen_at: string
          id: string
          ip_hash: string | null
          last_seen_at: string
          os: string | null
          pharmacy_id: string
          revoked_at: string | null
          revoked_by: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          device_type?: string | null
          first_seen_at?: string
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          os?: string | null
          pharmacy_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          browser?: string | null
          device_type?: string | null
          first_seen_at?: string
          id?: string
          ip_hash?: string | null
          last_seen_at?: string
          os?: string | null
          pharmacy_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_settings: {
        Row: {
          advances: number
          basic_salary: number
          commission_percent: number
          created_at: string
          id: string
          monthly_target: number
          pharmacy_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          advances?: number
          basic_salary?: number
          commission_percent?: number
          created_at?: string
          id?: string
          monthly_target?: number
          pharmacy_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          advances?: number
          basic_salary?: number
          commission_percent?: number
          created_at?: string
          id?: string
          monthly_target?: number
          pharmacy_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_shifts: {
        Row: {
          active_seconds: number
          created_at: string
          device_label: string | null
          ended_at: string | null
          id: string
          idle_seconds: number
          last_heartbeat_at: string
          pharmacy_id: string
          session_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          active_seconds?: number
          created_at?: string
          device_label?: string | null
          ended_at?: string | null
          id?: string
          idle_seconds?: number
          last_heartbeat_at?: string
          pharmacy_id: string
          session_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          active_seconds?: number
          created_at?: string
          device_label?: string | null
          ended_at?: string | null
          id?: string
          idle_seconds?: number
          last_heartbeat_at?: string
          pharmacy_id?: string
          session_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_payments: {
        Row: {
          amount_bdt: number
          created_at: string
          duration_days: number
          id: string
          invoice_id: string | null
          metadata: Json | null
          pharmacy_id: string
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          amount_bdt: number
          created_at?: string
          duration_days: number
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          pharmacy_id: string
          provider?: string
          status?: string
          user_id: string
        }
        Update: {
          amount_bdt?: number
          created_at?: string
          duration_days?: number
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          pharmacy_id?: string
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_active_sessions: {
        Row: {
          last_seen: string | null
          pharmacy_id: string | null
          profile_id: string | null
          role: string | null
          shop_name: string | null
          staff_label: string | null
        }
        Relationships: []
      }
      admin_activity_stats: {
        Row: {
          actions_30d: number | null
          actions_7d: number | null
          last_action_at: string | null
          pharmacy_id: string | null
        }
        Insert: {
          actions_30d?: never
          actions_7d?: never
          last_action_at?: never
          pharmacy_id?: string | null
        }
        Update: {
          actions_30d?: never
          actions_7d?: never
          last_action_at?: never
          pharmacy_id?: string | null
        }
        Relationships: []
      }
      admin_ai_daily: {
        Row: {
          day: string | null
          messages: number | null
          pharmacy_id: string | null
        }
        Relationships: []
      }
      admin_ai_stats: {
        Row: {
          conversations: number | null
          last_message_at: string | null
          messages: number | null
          pharmacy_id: string | null
        }
        Insert: {
          conversations?: never
          last_message_at?: never
          messages?: never
          pharmacy_id?: string | null
        }
        Update: {
          conversations?: never
          last_message_at?: never
          messages?: never
          pharmacy_id?: string | null
        }
        Relationships: []
      }
      admin_ai_topics: {
        Row: {
          occurrences: number | null
          pharmacy_id: string | null
          topic: string | null
        }
        Relationships: []
      }
      admin_daily_sales: {
        Row: {
          day: string | null
          invoice_count: number | null
          pharmacy_id: string | null
          sales_total: number | null
        }
        Relationships: []
      }
      admin_dau_daily: {
        Row: {
          active_users: number | null
          day: string | null
          role: string | null
        }
        Relationships: []
      }
      admin_expiring_shops: {
        Row: {
          days_left: number | null
          id: string | null
          name: string | null
          subscription_expiry: string | null
          subscription_plan: string | null
        }
        Insert: {
          days_left?: never
          id?: string | null
          name?: string | null
          subscription_expiry?: string | null
          subscription_plan?: string | null
        }
        Update: {
          days_left?: never
          id?: string | null
          name?: string | null
          subscription_expiry?: string | null
          subscription_plan?: string | null
        }
        Relationships: []
      }
      admin_live_sessions: {
        Row: {
          sessions_15m: number | null
          sessions_60m: number | null
        }
        Relationships: []
      }
      admin_new_registrations: {
        Row: {
          created_at: string | null
          district: string | null
          division: string | null
          id: string | null
          is_demo: boolean | null
          name: string | null
          subscription_plan: string | null
        }
        Insert: {
          created_at?: string | null
          district?: string | null
          division?: string | null
          id?: string | null
          is_demo?: never
          name?: string | null
          subscription_plan?: string | null
        }
        Update: {
          created_at?: string | null
          district?: string | null
          division?: string | null
          id?: string | null
          is_demo?: never
          name?: string | null
          subscription_plan?: string | null
        }
        Relationships: []
      }
      admin_page_engagement: {
        Row: {
          events: number | null
          page: string | null
          pharmacy_id: string | null
        }
        Relationships: []
      }
      admin_platform_totals: {
        Row: {
          active_shops: number | null
          demo_shops: number | null
          suspended_shops: number | null
          total_shops: number | null
        }
        Relationships: []
      }
      admin_recent_payments: {
        Row: {
          amount_bdt: number | null
          created_at: string | null
          duration_days: number | null
          id: string | null
          pharmacy_id: string | null
          provider: string | null
          shop_name: string | null
        }
        Relationships: []
      }
      admin_revenue_daily: {
        Row: {
          day: string | null
          payment_count: number | null
          revenue_bdt: number | null
        }
        Relationships: []
      }
      admin_screen_time: {
        Row: {
          day: string | null
          full_name: string | null
          minutes: number | null
          pharmacy_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      admin_shop_growth: {
        Row: {
          cumulative_shops: number | null
          week_start: string | null
        }
        Relationships: []
      }
      admin_shop_stats: {
        Row: {
          customers_count: number | null
          last_sale_at: string | null
          medicines_count: number | null
          pharmacy_id: string | null
          sales_30d: number | null
          sales_count: number | null
        }
        Insert: {
          customers_count?: never
          last_sale_at?: never
          medicines_count?: never
          pharmacy_id?: string | null
          sales_30d?: never
          sales_count?: never
        }
        Update: {
          customers_count?: never
          last_sale_at?: never
          medicines_count?: never
          pharmacy_id?: string | null
          sales_30d?: never
          sales_count?: never
        }
        Relationships: []
      }
      admin_tenant_payments: {
        Row: {
          amount_bdt: number | null
          created_at: string | null
          duration_days: number | null
          id: string | null
          pharmacy_id: string | null
          provider: string | null
          status: string | null
        }
        Insert: {
          amount_bdt?: number | null
          created_at?: string | null
          duration_days?: number | null
          id?: string | null
          pharmacy_id?: string | null
          provider?: string | null
          status?: string | null
        }
        Update: {
          amount_bdt?: number | null
          created_at?: string | null
          duration_days?: number | null
          id?: string | null
          pharmacy_id?: string | null
          provider?: string | null
          status?: string | null
        }
        Relationships: []
      }
      admin_tenant_staff: {
        Row: {
          full_name: string | null
          id: string | null
          is_demo: boolean | null
          last_seen: string | null
          pharmacy_id: string | null
          phone: string | null
          role: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
          is_demo?: boolean | null
          last_seen?: string | null
          pharmacy_id?: string | null
          phone?: string | null
          role?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
          is_demo?: boolean | null
          last_seen?: string | null
          pharmacy_id?: string | null
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_active_sessions"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_activity_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_ai_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_daily_sales"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_expiring_shops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_new_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_shop_stats"
            referencedColumns: ["pharmacy_id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "admin_tenants_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_tenants_directory: {
        Row: {
          address: string | null
          created_at: string | null
          demo_expires_at: string | null
          district: string | null
          division: string | null
          email: string | null
          id: string | null
          is_demo: boolean | null
          is_suspended: boolean | null
          last_payment_amount: number | null
          last_payment_at: string | null
          last_payment_duration_days: number | null
          last_seen: string | null
          lifetime_revenue: number | null
          logo_url: string | null
          name: string | null
          owner_name: string | null
          owner_phone: string | null
          phone: string | null
          proprietor_name: string | null
          staff_count: number | null
          subscription_expiry: string | null
          subscription_plan: string | null
          subscription_started_at: string | null
          upazila: string | null
        }
        Relationships: []
      }
      admin_top_medicines: {
        Row: {
          medicine_name: string | null
          pharmacy_id: string | null
          qty_sold: number | null
          revenue_bdt: number | null
        }
        Relationships: []
      }
      unique_companies: {
        Row: {
          company: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_staff_invitation: {
        Args: { _token: string }
        Returns: {
          pharmacy_id: string
          pharmacy_name: string
          role: string
        }[]
      }
      admin_remove_staff: { Args: { _user_id: string }; Returns: undefined }
      admin_reset_staff_pin: { Args: { _user_id: string }; Returns: undefined }
      admin_resync_medicines_pack_info: { Args: never; Returns: number }
      admin_set_staff_role: {
        Args: { _role: string; _user_id: string }
        Returns: undefined
      }
      admin_truncate_master_medicines: { Args: never; Returns: undefined }
      close_stale_shifts: { Args: never; Returns: number }
      complete_sale: { Args: { _payload: Json }; Returns: string }
      create_group_room: {
        Args: { _avatar_url?: string; _member_ids: string[]; _name: string }
        Returns: string
      }
      extend_subscription_admin: {
        Args: {
          _amount: number
          _days: number
          _invoice_id?: string
          _pharmacy_id: string
          _provider?: string
          _user_id: string
        }
        Returns: string
      }
      get_chat_inbox: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          last_message: string
          last_message_at: string
          other_user_id: string
          room_id: string
          type: string
          unread_count: number
        }[]
      }
      get_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          email: string
          expires_at: string
          is_expired: boolean
          pharmacy_id: string
          pharmacy_name: string
          role: string
          status: string
        }[]
      }
      get_master_companies: {
        Args: { _search?: string }
        Returns: {
          name: string
        }[]
      }
      get_my_pharmacy_public: {
        Args: never
        Returns: {
          address: string
          cover_url: string
          created_at: string
          default_discount: number
          district: string
          division: string
          id: string
          invoice_footer: string
          logo_url: string
          name: string
          upazila: string
        }[]
      }
      get_or_create_direct_room: {
        Args: { _other_user: string }
        Returns: string
      }
      get_pharmacy_member_directory: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          last_seen: string
          phone: string
          role: string
        }[]
      }
      get_pharmacy_member_names: {
        Args: never
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      get_pharmacy_member_presence: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          last_seen: string
          role: string
          user_id: string
        }[]
      }
      get_pharmacy_staff_overview: {
        Args: never
        Returns: {
          avatar_url: string
          basic_salary: number
          commission_percent: number
          full_name: string
          is_suspended: boolean
          last_seen: string
          month_count: number
          month_sales: number
          monthly_target: number
          phone: string
          role: string
          user_id: string
        }[]
      }
      get_pharmacy_staff_profile: {
        Args: { _user_id: string }
        Returns: {
          avatar_url: string
          full_name: string
          id: string
          pharmacy_id: string
          phone: string
          role: string
        }[]
      }
      get_staff_activity_kpis: { Args: never; Returns: Json }
      get_user_pharmacy_id: { Args: never; Returns: string }
      has_staff_permission: {
        Args: { _key: string; _user_id: string }
        Returns: boolean
      }
      has_staff_pin: { Args: never; Returns: boolean }
      heartbeat_shift: {
        Args: {
          _active_delta?: number
          _device?: Json
          _idle_delta?: number
          _session_id: string
        }
        Returns: string
      }
      increment_product_target_progress: {
        Args: {
          _medicine_id: string
          _occurred_at: string
          _pharmacy_id: string
          _qty: number
          _user_id: string
        }
        Returns: undefined
      }
      is_my_session_revoked: { Args: { _session_id: string }; Returns: boolean }
      is_pharmacy_admin: { Args: never; Returns: boolean }
      is_pharmacy_admin_or_manager: { Args: never; Returns: boolean }
      is_room_admin: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      is_room_member: {
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      is_staff_suspended: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      mark_room_read: { Args: { _room_id: string }; Returns: undefined }
      realtime_room_topic_uuid: { Args: { _topic: string }; Returns: string }
      revoke_staff_session: {
        Args: { _session_id: string }
        Returns: undefined
      }
      search_master_medicines: {
        Args: { _companies?: string[]; _limit?: number; _query: string }
        Returns: {
          box_size: string | null
          brand_name: string
          company: string | null
          created_at: string | null
          format: string | null
          generic_name: string | null
          id: string
          last_synced_at: string | null
          pack_size: string | null
          pcs_per_strip: number | null
          search_vector: unknown
          strength: string | null
          strip_per_pack: number | null
          unit_price: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "master_medicines"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_medicines: {
        Args: { _pharmacy_id: string; _query: string }
        Returns: {
          box_size: string | null
          company_name: string | null
          created_at: string | null
          expiry_date: string | null
          format: string | null
          generic_name: string | null
          id: string
          name: string
          pack_size: string | null
          packaging_type: string | null
          pcs_per_strip: number | null
          pharmacy_id: string
          price: number | null
          product_size: string | null
          product_type: string | null
          stock_alert: number | null
          stock_quantity: number | null
          strength: string | null
          strip_per_pack: number | null
          unit_format: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "medicines"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      seed_demo_pharmacy: {
        Args: { _pharmacy_id: string; _user_id: string }
        Returns: undefined
      }
      set_staff_pin: { Args: { _pin: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      submit_blind_closing: {
        Args: { _declared: number; _notes?: string }
        Returns: Json
      }
      touch_last_seen: { Args: never; Returns: undefined }
      verify_staff_pin: { Args: { _pin: string }; Returns: Json }
    }
    Enums: {
      app_role: "super_admin" | "shop_owner" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "shop_owner", "staff"],
    },
  },
} as const
