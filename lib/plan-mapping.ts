import type {
  GeneratedPlan,
  PlanDay,
  PlannerRecipe,
  PlannerSettings,
} from "@/lib/planner";
import type { EntryType, Household, Recipe } from "@/lib/supabase/types";

/* DB の行を、献立生成が受け取る形に直す。
   planner 側に Supabase の型を持ち込まないための境界（仕様書 2.3）。 */

export function toPlannerRecipe(
  recipe: Recipe,
  ingredientNames: readonly string[],
): PlannerRecipe {
  return {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    dishType: recipe.dish_type,
    mainProtein: recipe.main_protein,
    method: recipe.method,
    cookTimeMin: recipe.cook_time_min,
    foodGroups: recipe.food_groups,
    tags: recipe.tags,
    ingredientNames: [...ingredientNames],
  };
}

export function toPlannerSettings(household: Household): PlannerSettings {
  return {
    allergies: household.allergies,
    disliked: household.disliked,
    repeatGapDays: household.repeat_gap_days,
    weekdayMaxMinutes: household.weekday_max_minutes,
    weekendMaxMinutes: household.weekend_max_minutes,
  };
}

/* 週の起点。日曜始まりの7日間（変更記録 3.10。仕様書 1.2 は月曜始まりだった）。 */
export function weekStartOf(date: Date): string {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const back = new Date(utc).getUTCDay(); // 0=日
  return new Date(utc - back * 86400000).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

export function formatDay(date: string): { day: string; weekday: string } {
  const parsed = new Date(`${date}T00:00:00Z`);
  return {
    day: `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}`,
    weekday: WEEKDAY_LABEL[parsed.getUTCDay()],
  };
}

/* 保存された行から週の献立を組み立て直す。
   週間献立と栄養サマリの両方が読むので、ここに1つだけ置く（変更記録 3.26）。 */
export function itemsToPlan(
  weekStart: string,
  items: readonly {
    date: string;
    slot: string;
    recipe_id: string | null;
    entry_type: EntryType;
    locked: boolean;
  }[],
): GeneratedPlan {
  const days: PlanDay[] = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    entryType: "cook",
    /* 行が1つも無い日は「まだ決めていない」。
       生成した日は必ず主菜の行を持つので、これで見分けられる。 */
    undecided: true,
    locked: false,
    mainId: null,
    sideId: null,
    soupId: null,
  }));

  for (const item of items) {
    const day = days.find((d) => d.date === item.date);
    if (!day) continue;
    day.entryType = item.entry_type;
    day.undecided = false;
    day.locked = day.locked || item.locked;
    if (item.slot === "main") day.mainId = item.recipe_id;
    if (item.slot === "side") day.sideId = item.recipe_id;
    if (item.slot === "soup") day.soupId = item.recipe_id;
  }

  return { weekStart, days, violations: [], attempts: 0 };
}
