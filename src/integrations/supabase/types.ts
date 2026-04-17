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
      master_medicines: {
        Row: {
          box_size: string | null
          brand_name: string
          company: string | null
          created_at: string | null
          format: string | null
          generic_name: string | null
          id: string
          pack_size: string | null
          strength: string | null
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
          pack_size?: string | null
          strength?: string | null
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
          pack_size?: string | null
          strength?: string | null
          unit_price?: number | null
        }
        Relationships: []
      }
      medicines: {
        Row: {
          company_name: string | null
          created_at: string | null
          expiry_date: string | null
          id: string
          name: string
          pcs_per_strip: number | null
          pharmacy_id: string
          price: number | null
          product_size: string | null
          product_type: string | null
          stock_alert: number | null
          stock_quantity: number | null
          strip_per_pack: number | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          name: string
          pcs_per_strip?: number | null
          pharmacy_id: string
          price?: number | null
          product_size?: string | null
          product_type?: string | null
          stock_alert?: number | null
          stock_quantity?: number | null
          strip_per_pack?: number | null
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          expiry_date?: string | null
          id?: string
          name?: string
          pcs_per_strip?: number | null
          pharmacy_id?: string
          price?: number | null
          product_size?: string | null
          product_type?: string | null
          stock_alert?: number | null
          stock_quantity?: number | null
          strip_per_pack?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "medicines_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
      }
      pharmacies: {
        Row: {
          address: string | null
          cover_url: string | null
          created_at: string | null
          default_discount: number | null
          district: string | null
          division: string | null
          drug_license: string | null
          email: string | null
          id: string
          invoice_footer: string | null
          logo_url: string | null
          name: string
          phone: string | null
          proprietor_name: string | null
          trade_license: string | null
          upazila: string | null
        }
        Insert: {
          address?: string | null
          cover_url?: string | null
          created_at?: string | null
          default_discount?: number | null
          district?: string | null
          division?: string | null
          drug_license?: string | null
          email?: string | null
          id?: string
          invoice_footer?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          proprietor_name?: string | null
          trade_license?: string | null
          upazila?: string | null
        }
        Update: {
          address?: string | null
          cover_url?: string | null
          created_at?: string | null
          default_discount?: number | null
          district?: string | null
          division?: string | null
          drug_license?: string | null
          email?: string | null
          id?: string
          invoice_footer?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          proprietor_name?: string | null
          trade_license?: string | null
          upazila?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          pharmacy_id: string | null
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          pharmacy_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          pharmacy_id?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_pharmacy_id_fkey"
            columns: ["pharmacy_id"]
            isOneToOne: false
            referencedRelation: "pharmacies"
            referencedColumns: ["id"]
          },
        ]
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
      shop_staff: {
        Row: {
          created_at: string | null
          email: string
          id: string
          invited_by: string
          pharmacy_id: string
          role: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          invited_by: string
          pharmacy_id: string
          role?: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          invited_by?: string
          pharmacy_id?: string
          role?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      get_user_pharmacy_id: { Args: never; Returns: string }
      is_pharmacy_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
