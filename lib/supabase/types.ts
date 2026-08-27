/* データベースの型定義。supabase/migrations の DDL と1対1で対応する。

   これを Supabase クライアントの型引数に渡すことで、問い合わせの結果に
   型がつく。`any` や `as` で握りつぶさずに済ませるための土台（仕様書 2.2-10）。

   スキーマを変更したら、必ずここも合わせて更新すること。 */

export type RecipeCategory = "washoku" | "yoshoku" | "chuka" | "other";
export type DishType = "main" | "side" | "soup" | "rice";
export type MainProtein = "meat" | "fish" | "egg" | "soy" | "none";
export type CookMethod =
  | "grill"
  | "simmer"
  | "fry"
  | "stirfry"
  | "steam"
  | "raw"
  | "other";
export type RecipeStatus = "draft" | "active" | "archived";
export type RecipeSource = "ai" | "manual";
export type PlanStatus = "draft" | "confirmed";
export type EntryType = "cook" | "eatout" | "batch" | "leftover";

/* 並び順がそのまま買い物リストの表示順（売り場動線順）になる（仕様書 3.1）。 */
export type ShopCategory =
  | "produce"
  | "meat"
  | "seafood"
  | "tofu"
  | "dairy_egg"
  | "dry"
  | "seasoning"
  | "other";

/* 並び順の実体は lib/shop-order.ts にある。
   ここから使っている箇所を壊さないよう、そのまま再輸出する。 */
export { SHOP_CATEGORY_ORDER } from "@/lib/shop-order";

type HouseholdRow = {
  id: string;
  name: string;
  servings: number;
  allergies: string[];
  disliked: string[];
  ratio_washoku: number;
  ratio_yoshoku: number;
  ratio_chuka: number;
  repeat_gap_days: number;
  include_seasoning_in_shopping: boolean;
  weekday_max_minutes: number;
  weekend_max_minutes: number | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  household_id: string;
  display_name: string;
  created_at: string;
};

type IngredientMasterRow = {
  id: string;
  household_id: string;
  name: string;
  aliases: string[];
  shop_category: ShopCategory;
  default_unit: string | null;
  is_pantry: boolean;
};

type RecipeRow = {
  id: string;
  household_id: string;
  name: string;
  category: RecipeCategory;
  dish_type: DishType;
  main_protein: MainProtein;
  method: CookMethod;
  cook_time_min: number;
  servings: number;
  food_groups: number[];
  tags: string[];
  steps: string[];
  memo: string | null;
  source: RecipeSource;
  status: RecipeStatus;
  created_at: string;
  updated_at: string;
};

type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  name: string;
  qty: number | null;
  unit: string | null;
  shop_category: ShopCategory;
  sort_order: number;
};

type MealPlanRow = {
  id: string;
  household_id: string;
  week_start: string;
  status: PlanStatus;
  created_at: string;
};

type MealPlanItemRow = {
  id: string;
  plan_id: string;
  date: string;
  slot: DishType;
  recipe_id: string | null;
  entry_type: EntryType;
  locked: boolean;
  note: string | null;
};

type PlanRequestRow = {
  id: string;
  plan_id: string;
  free_text: string | null;
  parsed_tags: unknown;
  created_by: string | null;
  created_at: string;
};

type ShoppingItemRow = {
  id: string;
  plan_id: string;
  name: string;
  total_qty: number | null;
  unit: string | null;
  shop_category: ShopCategory;
  checked: boolean;
  checked_by: string | null;
  checked_at: string | null;
  /* 会計を済ませた時刻。買い物は週に何度も分かれるため、
     「かごに入れた（checked）」と「買い終えた」を別に持つ（変更記録 3.16）。 */
  purchased_at: string | null;
  /* 手で足した品。献立から作り直しても消さない（変更記録 3.18）。 */
  is_extra: boolean;
  sort_order: number;
};

/* 料理のリクエスト（変更記録 3.20）。週には紐づけず、
   献立に入るまで効き続ける。 */
export type RequestStatus = "open" | "done";

type RecipeRequestRow = {
  id: string;
  household_id: string;
  recipe_id: string;
  note: string | null;
  status: RequestStatus;
  requested_by: string | null;
  created_at: string;
  fulfilled_at: string | null;
};

type RecipeRatingRow = {
  recipe_id: string;
  user_id: string;
  score: number;
  updated_at: string;
};

/* Insert は既定値のある列を省略でき、Update は全て省略できる。 */
type Writable<Row, Required extends keyof Row> = Partial<Row> &
  Pick<Row, Required>;

export type Database = {
  public: {
    Tables: {
      households: {
        Row: HouseholdRow;
        Insert: Partial<HouseholdRow>;
        Update: Partial<HouseholdRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Writable<ProfileRow, "user_id" | "household_id" | "display_name">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      ingredient_master: {
        Row: IngredientMasterRow;
        Insert: Writable<
          IngredientMasterRow,
          "household_id" | "name" | "shop_category"
        >;
        Update: Partial<IngredientMasterRow>;
        Relationships: [];
      };
      recipes: {
        Row: RecipeRow;
        Insert: Writable<
          RecipeRow,
          "household_id" | "name" | "category" | "dish_type" | "cook_time_min"
        >;
        Update: Partial<RecipeRow>;
        Relationships: [];
      };
      recipe_ingredients: {
        Row: RecipeIngredientRow;
        Insert: Writable<RecipeIngredientRow, "recipe_id" | "name">;
        Update: Partial<RecipeIngredientRow>;
        Relationships: [];
      };
      meal_plans: {
        Row: MealPlanRow;
        Insert: Writable<MealPlanRow, "household_id" | "week_start">;
        Update: Partial<MealPlanRow>;
        Relationships: [];
      };
      meal_plan_items: {
        Row: MealPlanItemRow;
        Insert: Writable<MealPlanItemRow, "plan_id" | "date" | "slot">;
        Update: Partial<MealPlanItemRow>;
        Relationships: [];
      };
      plan_requests: {
        Row: PlanRequestRow;
        Insert: Writable<PlanRequestRow, "plan_id">;
        Update: Partial<PlanRequestRow>;
        Relationships: [];
      };
      shopping_items: {
        Row: ShoppingItemRow;
        Insert: Writable<
          ShoppingItemRow,
          "plan_id" | "name" | "shop_category"
        >;
        Update: Partial<ShoppingItemRow>;
        Relationships: [];
      };
      recipe_ratings: {
        Row: RecipeRatingRow;
        Insert: Writable<RecipeRatingRow, "recipe_id" | "user_id" | "score">;
        Update: Partial<RecipeRatingRow>;
        Relationships: [];
      };
      recipe_requests: {
        Row: RecipeRequestRow;
        Insert: Writable<
          RecipeRequestRow,
          "household_id" | "recipe_id"
        >;
        Update: Partial<RecipeRequestRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_household_id: {
        Args: Record<string, never>;
        Returns: string | null;
      };
    };
    Enums: {
      recipe_category: RecipeCategory;
      dish_type: DishType;
      main_protein: MainProtein;
      cook_method: CookMethod;
      recipe_status: RecipeStatus;
      recipe_source: RecipeSource;
      plan_status: PlanStatus;
      entry_type: EntryType;
      shop_category: ShopCategory;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Recipe = RecipeRow;
export type RecipeIngredient = RecipeIngredientRow;
export type RecipeRating = RecipeRatingRow;
export type RecipeRequest = RecipeRequestRow;
export type Household = HouseholdRow;
export type Profile = ProfileRow;
