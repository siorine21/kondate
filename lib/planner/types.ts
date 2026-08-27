import type {
  CookMethod,
  DishType,
  EntryType,
  MainProtein,
  RecipeCategory,
} from "@/lib/supabase/types";

/* 献立生成に必要な形だけを持つ。ここには Supabase を import しない
   （仕様書 2.3）。純粋関数として単体テストできる状態を保つため。 */

export type PlannerRecipe = {
  id: string;
  name: string;
  category: RecipeCategory;
  dishType: DishType;
  mainProtein: MainProtein;
  method: CookMethod;
  cookTimeMin: number;
  foodGroups: number[];
  tags: string[];
  /* アレルギー除外と、食材の使い切りの判定に使う。 */
  ingredientNames: string[];
};

export type PlannerSettings = {
  allergies: string[];
  disliked: string[];
  repeatGapDays: number;
  weekdayMaxMinutes: number;
  /* null は「制限なし」（仕様書 3.2）。 */
  weekendMaxMinutes: number | null;
};

/* 前の週までに使った主菜。同じ主菜を空ける判定に使う（7.1）。 */
export type MainHistory = {
  recipeId: string;
  date: string; // yyyy-mm-dd
};

export type PlanRequest = {
  /* この日はこれ、と決め打ちする枠。locked になる（7.2-1）。 */
  fixedDays?: { date: string; recipeId: string }[];
  /* 自炊しない日。 */
  noCookDays?: { date: string; entryType: EntryType }[];
  /* 未定にする日。品を入れない。 */
  undecidedDays?: string[];
  /* 手で選んだ副菜・汁物。null は「つけない」。
     渡した日は自動で選び直さない。 */
  fixedSides?: { date: string; recipeId: string | null }[];
  fixedSoups?: { date: string; recipeId: string | null }[];
  /* リクエストのタグ。該当するレシピを押し上げる（7.2）。 */
  tags?: string[];
  /* リクエストされた料理。週のどこかに入るよう強く押し上げる。
     日は決めない。fixedDays（決め打ち）とは別物で、
     条件に合わない週なら入らないこともある（変更記録 3.20）。 */
  requestedMainIds?: readonly string[];
};

export type PlanDay = {
  date: string;
  entryType: EntryType;
  /* まだ決めていない日。品を入れず、週次の判定からも外す。
     「自炊しない」とは別で、あとで決めるという意味。 */
  undecided: boolean;
  locked: boolean;
  mainId: string | null;
  sideId: string | null;
  soupId: string | null;
};

export type Violation =
  | { kind: "fish_shortage"; actual: number; target: number }
  | { kind: "soy_shortage"; actual: number; target: number }
  | { kind: "vegetable_missing"; dates: string[] }
  | { kind: "fry_in_a_row"; dates: string[] }
  | { kind: "main_repeated"; date: string; recipeId: string }
  | { kind: "category_three_in_a_row"; dates: string[] }
  | { kind: "allergy_included"; date: string; recipeId: string }
  | { kind: "cook_time_over"; date: string; recipeId: string; limit: number }
  /* 登録が少なく、同じ主菜を空ける日数を縮めたときに出す。
     制約違反ではないが、黙って条件を変えたことは伝える。 */
  | { kind: "repeat_gap_relaxed"; from: number; to: number };

export type GeneratedPlan = {
  weekStart: string;
  days: PlanDay[];
  /* 10回試しても満たせなかったハード制約。空なら全て満たしている（7.2-5）。 */
  violations: Violation[];
  attempts: number;
};

export type PlanResult =
  | { ok: true; plan: GeneratedPlan }
  | {
      ok: false;
      reason: "not_enough_mains";
      /* 登録されている主菜の総数。 */
      total: number;
      need: number;
    };
