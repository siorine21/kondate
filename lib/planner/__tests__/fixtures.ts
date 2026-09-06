import { readFileSync } from "node:fs";
import path from "node:path";

import type { PlannerRecipe, PlannerSettings } from "../types.ts";

/* 実際のシード20件をそのまま使う（仕様書 11.1）。
   作り物の配列で通しても、完了条件の確認にならないため。 */

type SeedIngredient = { name: string };
type SeedRecipe = {
  name: string;
  category: string;
  dish_type: string;
  main_protein: string;
  method: string;
  cook_time_min: number;
  food_groups: number[];
  tags: string[];
  ingredients: SeedIngredient[];
};

const seedPath = path.join(
  import.meta.dirname,
  "../../../supabase/setup/seed-recipes.json",
);

function readSeed(): SeedRecipe[] {
  const parsed: unknown = JSON.parse(readFileSync(seedPath, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("recipes" in parsed) ||
    !Array.isArray(parsed.recipes)
  ) {
    throw new Error("シードの形が想定と違います");
  }
  return parsed.recipes;
}

export function seedRecipes(): PlannerRecipe[] {
  return readSeed().map((recipe) => ({
    id: recipe.name,
    name: recipe.name,
    category: asCategory(recipe.category),
    dishType: asDishType(recipe.dish_type),
    mainProtein: asProtein(recipe.main_protein),
    method: asMethod(recipe.method),
    cookTimeMin: recipe.cook_time_min,
    foodGroups: recipe.food_groups,
    tags: recipe.tags,
    ingredientNames: recipe.ingredients.map((ing) => ing.name),
  }));
}

/* JSON からの値は string なので、想定外はここで落とす。
   `as` で握りつぶさない（仕様書 2.2-10）。 */
function pick<T extends string>(allowed: readonly T[], value: string): T {
  const found = allowed.find((item) => item === value);
  if (!found) throw new Error(`想定外の値: ${value}`);
  return found;
}

const asCategory = (v: string) =>
  pick(["washoku", "yoshoku", "chuka", "other"] as const, v);
const asDishType = (v: string) =>
  pick(["main", "side", "soup", "rice"] as const, v);
const asProtein = (v: string) =>
  pick(["meat", "fish", "egg", "soy", "none"] as const, v);
const asMethod = (v: string) =>
  pick(
    ["grill", "simmer", "fry", "stirfry", "steam", "raw", "other"] as const,
    v,
  );

export const defaultSettings: PlannerSettings = {
  allergies: [],
  disliked: [],
  repeatGapDays: 14,
  weekdayMaxMinutes: 30,
  weekendMaxMinutes: null,
  /* 仕様書 3.1 の既定 和4・洋1・中2。 */
  categoryRatio: { washoku: 4, yoshoku: 1, chuka: 2 },
};

export const SUNDAY = "2026-08-23"; // 日曜（週の起点。変更記録 3.10）
