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
      board_chapter: {
        Row: {
          created_at: string
          ended_at: string | null
          ended_by_redemption_id: string | null
          id: string
          kid_id: string
          started_at: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          ended_by_redemption_id?: string | null
          id?: string
          kid_id: string
          started_at?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          ended_by_redemption_id?: string | null
          id?: string
          kid_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_chapter_ended_by_redemption_fk"
            columns: ["ended_by_redemption_id"]
            isOneToOne: false
            referencedRelation: "redemption_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_chapter_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid"
            referencedColumns: ["id"]
          },
        ]
      }
      chore: {
        Row: {
          active: boolean
          created_at: string
          household_id: string
          id: string
          name: string
          sort_order: number
          sticker_image_id: string | null
          sticker_value: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          household_id: string
          id?: string
          name: string
          sort_order?: number
          sticker_image_id?: string | null
          sticker_value?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          sort_order?: number
          sticker_image_id?: string | null
          sticker_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "chore_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_sticker_image_id_fkey"
            columns: ["sticker_image_id"]
            isOneToOne: false
            referencedRelation: "sticker_image"
            referencedColumns: ["id"]
          },
        ]
      }
      household: {
        Row: {
          created_at: string
          id: string
          join_code: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_code: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          join_code?: string
          name?: string
        }
        Relationships: []
      }
      kid: {
        Row: {
          created_at: string
          current_balance: number
          current_chapter_id: string | null
          household_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          current_balance?: number
          current_chapter_id?: string | null
          household_id: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          current_balance?: number
          current_chapter_id?: string | null
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_current_chapter_fk"
            columns: ["current_chapter_id"]
            isOneToOne: false
            referencedRelation: "board_chapter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      parent: {
        Row: {
          auth_user_id: string
          created_at: string
          display_name: string
          household_id: string
          id: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          display_name: string
          household_id: string
          id?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          display_name?: string
          household_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      redemption_event: {
        Row: {
          chapter_id: string
          created_at: string
          id: string
          kid_id: string
          redeemed_by: string
          reward_tier_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string
          id?: string
          kid_id: string
          redeemed_by: string
          reward_tier_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          id?: string
          kid_id?: string
          redeemed_by?: string
          reward_tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redemption_event_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "board_chapter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_event_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_event_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "parent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_event_reward_tier_id_fkey"
            columns: ["reward_tier_id"]
            isOneToOne: false
            referencedRelation: "reward_tier"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_tier: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
          sort_order: number
          threshold: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          name: string
          sort_order?: number
          threshold: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
          sort_order?: number
          threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "reward_tier_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_event: {
        Row: {
          amount: number
          awarded_by: string
          chapter_id: string
          chore_id: string | null
          created_at: string
          id: string
          kid_id: string
          label: string | null
          position_x: number
          position_y: number
          rotation: number
          sticker_image_id: string | null
        }
        Insert: {
          amount?: number
          awarded_by: string
          chapter_id: string
          chore_id?: string | null
          created_at?: string
          id?: string
          kid_id: string
          label?: string | null
          position_x?: number
          position_y?: number
          rotation?: number
          sticker_image_id?: string | null
        }
        Update: {
          amount?: number
          awarded_by?: string
          chapter_id?: string
          chore_id?: string | null
          created_at?: string
          id?: string
          kid_id?: string
          label?: string | null
          position_x?: number
          position_y?: number
          rotation?: number
          sticker_image_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sticker_event_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "parent"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sticker_event_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "board_chapter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sticker_event_chore_id_fkey"
            columns: ["chore_id"]
            isOneToOne: false
            referencedRelation: "chore"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sticker_event_kid_id_fkey"
            columns: ["kid_id"]
            isOneToOne: false
            referencedRelation: "kid"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sticker_event_sticker_image_id_fkey"
            columns: ["sticker_image_id"]
            isOneToOne: false
            referencedRelation: "sticker_image"
            referencedColumns: ["id"]
          },
        ]
      }
      sticker_image: {
        Row: {
          created_at: string
          household_id: string
          id: string
          label: string | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          label?: string | null
          storage_path: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          label?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticker_image_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_household: {
        Args: {
          p_household_name: string
          p_kid_name: string
          p_parent_name: string
        }
        Returns: string
      }
      current_household_id: { Args: never; Returns: string }
      current_parent_id: { Args: never; Returns: string }
      gen_join_code: { Args: never; Returns: string }
      join_household: {
        Args: { p_join_code: string; p_parent_name: string }
        Returns: string
      }
      redeem_chapter: {
        Args: {
          p_kid_id: string
          p_chapter_id: string
          p_reward_tier_id: string
          p_redeemed_by: string
        }
        Returns: string
      }
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
