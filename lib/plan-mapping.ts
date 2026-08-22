import type { PlannerRecipe, PlannerSettings } from "@/lib/planner";
import type { Household, Recipe } from "@/lib/supabase/types";

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

/* 月曜始まりの週（仕様書 1.2）。日曜は前の週に含める。 */
export function mondayOf(date: Date): string {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const day = new Date(utc).getUTCDay(); // 0=日
  const back = day === 0 ? 6 : day - 1;
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
