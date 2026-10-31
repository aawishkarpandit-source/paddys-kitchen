// ════════════════════════════════════════════════════════════════════════════
//  Database types — hand-maintained mirror of supabase/schema.sql.
//  Shapes follow the same conventions as `supabase gen types` so you can swap
//  in generated types later without touching app code.
//
//  NOTE: `numeric` columns arrive from PostgREST as strings — UI math uses the
//  view types in `src/types/models.ts` after formatting helpers convert them.
// ════════════════════════════════════════════════════════════════════════════

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TableStatus = 'active' | 'inactive';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type CallStatus = 'pending' | 'resolved';
export type CallType = 'assistance' | 'bill';
export type StaffRole = 'owner' | 'admin' | 'staff';

export type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Json;
  is_active: boolean;
  created_at: string;
}
export type RestaurantInsert = {
  id?: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  settings?: Json;
  is_active?: boolean;
  created_at?: string;
};
export type RestaurantUpdate = Partial<RestaurantInsert>;

export type TableRowSchema = {
  id: string;
  restaurant_id: string;
  table_number: string;
  qr_code_url: string | null;
  status: TableStatus;
  created_at: string;
}
export type TableInsert = {
  id?: string;
  restaurant_id: string;
  table_number: string;
  qr_code_url?: string | null;
  status?: TableStatus;
  created_at?: string;
};
export type TableUpdate = Partial<TableInsert>;

export type CategoryRow = {
  id: string;
  restaurant_id: string;
  name: string;
  display_order: number;
  created_at: string;
}
export type CategoryInsert = {
  id?: string;
  restaurant_id: string;
  name: string;
  display_order?: number;
  created_at?: string;
};
export type CategoryUpdate = Partial<CategoryInsert>;

export type MenuItemRow = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: string; // numeric(10,2) → string per PostgREST convention
  image_url: string | null;
  is_available: boolean;
  dietary_tags: string[];
  display_order: number;
  created_at: string;
}
export type MenuItemInsert = {
  id?: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  description?: string | null;
  price: string;
  image_url?: string | null;
  is_available?: boolean;
  dietary_tags?: string[];
  display_order?: number;
  created_at?: string;
};
export type MenuItemUpdate = Partial<MenuItemInsert>;

export type ItemModifierRow = {
  id: string;
  menu_item_id: string;
  group_name: string;
  option_name: string;
  additional_price: string;
  is_required: boolean;
  display_order: number;
  created_at: string;
}
export type ItemModifierInsert = {
  id?: string;
  menu_item_id: string;
  group_name: string;
  option_name: string;
  additional_price?: string;
  is_required?: boolean;
  display_order?: number;
  created_at?: string;
};
export type ItemModifierUpdate = Partial<ItemModifierInsert>;

export type OrderRow = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  status: OrderStatus;
  total_amount: string;
  customer_notes: string | null;
  created_at: string;
  updated_at: string;
}
export type OrderInsert = {
  id?: string;
  restaurant_id: string;
  table_id?: string | null;
  status?: OrderStatus;
  total_amount?: string;
  customer_notes?: string | null;
  created_at?: string;
  updated_at?: string;
};
export type OrderUpdate = Partial<OrderInsert>;

export type OrderItemRow = {
  id: string;
  order_id: string;
  restaurant_id: string;
  menu_item_id: string | null;
  item_name: string;
  quantity: number;
  selected_modifiers: Json; // { group_name, option_name, additional_price }[]
  unit_price: string;
  item_total: string;
  created_at: string;
}
export type OrderItemInsert = {
  id?: string;
  order_id: string;
  restaurant_id: string;
  menu_item_id?: string | null;
  item_name?: string;
  quantity: number;
  selected_modifiers?: Json;
  unit_price?: string;
  item_total?: string;
  created_at?: string;
};
export type OrderItemUpdate = Partial<OrderItemInsert>;

export type StaffCallRow = {
  id: string;
  restaurant_id: string;
  table_id: string | null;
  call_type: CallType;
  status: CallStatus;
  created_at: string;
  resolved_at: string | null;
}
export type StaffCallInsert = {
  id?: string;
  restaurant_id: string;
  table_id?: string | null;
  call_type?: CallType;
  status?: CallStatus;
  created_at?: string;
  resolved_at?: string | null;
};
export type StaffCallUpdate = Partial<StaffCallInsert>;

export type StaffMemberRow = {
  id: string;
  user_id: string;
  restaurant_id: string;
  name: string;
  role: StaffRole;
  created_at: string;
}
export type StaffMemberInsert = {
  id?: string;
  user_id: string;
  restaurant_id: string;
  name?: string;
  role?: StaffRole;
  created_at?: string;
};
export type StaffMemberUpdate = Partial<StaffMemberInsert>;

// Reactive shape used by `supabase.from(...)` calls (add new tables here).
export type TableName =
  | 'restaurants'
  | 'tables'
  | 'categories'
  | 'menu_items'
  | 'item_modifiers'
  | 'orders'
  | 'order_items'
  | 'staff_calls'
  | 'staff_members';

export type ForeignKey = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}

type TableDef<R, I, U, Rel extends ForeignKey[] = []> = {
  Row: R;
  Insert: I;
  Update: U;
  Relationships: Rel;
}

/** Matches supabase-js's expected GenericSchema so query builders stay typed. */
export type Database = {
  public: {
    Tables: {
      restaurants: TableDef<
        RestaurantRow,
        RestaurantInsert,
        RestaurantUpdate,
        []
      >;
      tables: TableDef<
        TableRowSchema,
        TableInsert,
        TableUpdate,
        [{ foreignKeyName: 'tables_restaurant_id_fkey'; columns: ['restaurant_id']; isOneToOne: false; referencedRelation: 'restaurants'; referencedColumns: ['id'] }]
      >;
      categories: TableDef<
        CategoryRow,
        CategoryInsert,
        CategoryUpdate,
        [{ foreignKeyName: 'categories_restaurant_id_fkey'; columns: ['restaurant_id']; isOneToOne: false; referencedRelation: 'restaurants'; referencedColumns: ['id'] }]
      >;
      menu_items: TableDef<
        MenuItemRow,
        MenuItemInsert,
        MenuItemUpdate,
        [
          { foreignKeyName: 'menu_items_restaurant_id_fkey'; columns: ['restaurant_id']; isOneToOne: false; referencedRelation: 'restaurants'; referencedColumns: ['id'] },
          { foreignKeyName: 'menu_items_category_id_fkey'; columns: ['category_id']; isOneToOne: false; referencedRelation: 'categories'; referencedColumns: ['id'] },
        ]
      >;
      item_modifiers: TableDef<
        ItemModifierRow,
        ItemModifierInsert,
        ItemModifierUpdate,
        [{ foreignKeyName: 'item_modifiers_menu_item_id_fkey'; columns: ['menu_item_id']; isOneToOne: false; referencedRelation: 'menu_items'; referencedColumns: ['id'] }]
      >;
      orders: TableDef<
        OrderRow,
        OrderInsert,
        OrderUpdate,
        [
          { foreignKeyName: 'orders_restaurant_id_fkey'; columns: ['restaurant_id']; isOneToOne: false; referencedRelation: 'restaurants'; referencedColumns: ['id'] },
          { foreignKeyName: 'orders_table_id_fkey'; columns: ['table_id']; isOneToOne: false; referencedRelation: 'tables'; referencedColumns: ['id'] },
        ]
      >;
      order_items: TableDef<
        OrderItemRow,
        OrderItemInsert,
        OrderItemUpdate,
        [
          { foreignKeyName: 'order_items_order_id_fkey'; columns: ['order_id']; isOneToOne: false; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_restaurant_id_fkey'; columns: ['restaurant_id']; isOneToOne: false; referencedRelation: 'restaurants'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_menu_item_id_fkey'; columns: ['menu_item_id']; isOneToOne: false; referencedRelation: 'menu_items'; referencedColumns: ['id'] },
        ]
      >;
      staff_calls: TableDef<
        StaffCallRow,
        StaffCallInsert,
        StaffCallUpdate,
        [
          { foreignKeyName: 'staff_calls_restaurant_id_fkey'; columns: ['restaurant_id']; isOneToOne: false; referencedRelation: 'restaurants'; referencedColumns: ['id'] },
          { foreignKeyName: 'staff_calls_table_id_fkey'; columns: ['table_id']; isOneToOne: false; referencedRelation: 'tables'; referencedColumns: ['id'] },
        ]
      >;
      staff_members: TableDef<
        StaffMemberRow,
        StaffMemberInsert,
        StaffMemberUpdate,
        [
          { foreignKeyName: 'staff_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'staff_members_restaurant_id_fkey'; columns: ['restaurant_id']; isOneToOne: false; referencedRelation: 'restaurants'; referencedColumns: ['id'] },
        ]
      >;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      place_order: {
        Args: {
          p_restaurant_id: string;
          p_table_id: string;
          p_customer_notes?: string | null;
          p_items: Json;
        };
        Returns: { order?: OrderRow | null } | null;
      };
      cleanup_old_orders: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      my_staff_role: {
        Args: { p_restaurant_id: string };
        Returns: StaffRole | null;
      };
    };
    Enums: {
      table_status: TableStatus;
      order_status: OrderStatus;
      call_status: CallStatus;
      call_type: CallType;
      staff_role: StaffRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}


