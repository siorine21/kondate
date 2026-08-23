import type {
  MainHistory,
  PlanDay,
  PlannerRecipe,
  PlannerSettings,
  Violation,
} from "./types.ts";

/* 週次のハード制約（仕様書 7.1）。

   ここは「満たしているか」を見るだけで、直しはしない。
   直すのは generate 側の役目（7.2-5）。 */

export function isWeekend(weekStart: string, date: string): boolean {
  /* 週は日曜始まり（変更記録 3.10）。1番目の日曜と7番目の土曜が休日。 */
  const index = dayIndex(weekStart, date);
  return index === 0 || index === 6;
}

export function dayIndex(weekStart: string, date: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) /
      86400000,
  );
}

export function cookTimeLimit(
  settings: PlannerSettings,
  weekStart: string,
  date: string,
): number {
  if (!isWeekend(weekStart, date)) return settings.weekdayMaxMinutes;
  /* 休日の上限は null で「制限なし」。 */
  return settings.weekendMaxMinutes ?? Number.POSITIVE_INFINITY;
}

export function containsAvoided(
  recipe: PlannerRecipe,
  avoided: readonly string[],
): boolean {
  if (avoided.length === 0) return false;
  return recipe.ingredientNames.some((name) =>
    avoided.some((word) => word.length > 0 && name.includes(word)),
  );
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000,
  );
}

type Lookup = (id: string | null) => PlannerRecipe | null;

const isCooked = (day: PlanDay) => day.entryType === "cook" && !day.undecided;

export function validateWeek(input: {
  weekStart: string;
  days: readonly PlanDay[];
  byId: Lookup;
  settings: PlannerSettings;
  history: readonly MainHistory[];
}): Violation[] {
  const { weekStart, days, byId, settings, history } = input;
  const violations: Violation[] = [];

  /* 自炊しない日と、まだ決めていない日は判定から外す。
     品が無いので満たしようがない。 */
  const cookDays = days.filter(
    (day) => day.entryType === "cook" && !day.undecided,
  );

  const mainOf = (day: PlanDay) => byId(day.mainId);
  const dishesOf = (day: PlanDay) =>
    [byId(day.mainId), byId(day.sideId), byId(day.soupId)].filter(
      (recipe): recipe is PlannerRecipe => recipe !== null,
    );

  /* 魚を主菜で週2回以上 */
  const fish = cookDays.filter(
    (day) => mainOf(day)?.mainProtein === "fish",
  ).length;
  if (fish < 2) {
    violations.push({ kind: "fish_shortage", actual: fish, target: 2 });
  }

  /* 大豆製品を主菜または副菜で週2回以上 */
  const soy = cookDays.filter((day) =>
    [byId(day.mainId), byId(day.sideId)].some(
      (recipe) => recipe?.mainProtein === "soy",
    ),
  ).length;
  if (soy < 2) {
    violations.push({ kind: "soy_shortage", actual: soy, target: 2 });
  }

  /* 緑黄色野菜（食品群3）を全日で1品以上 */
  const withoutVegetable = cookDays
    .filter((day) => !dishesOf(day).some((r) => r.foodGroups.includes(3)))
    .map((day) => day.date);
  if (withoutVegetable.length > 0) {
    violations.push({ kind: "vegetable_missing", dates: withoutVegetable });
  }

  /* 揚げ物の2日連続禁止。自炊しない日は連続を切る。 */
  for (let i = 1; i < days.length; i += 1) {
    const previous = days[i - 1];
    const current = days[i];
    if (!isCooked(previous) || !isCooked(current)) continue;
    if (
      mainOf(previous)?.method === "fry" &&
      mainOf(current)?.method === "fry"
    ) {
      violations.push({
        kind: "fry_in_a_row",
        dates: [previous.date, current.date],
      });
    }
  }

  /* 同一主菜を repeatGapDays 以内に出さない。前の週までの履歴も見る。 */
  const used: MainHistory[] = history.map((entry) => ({ ...entry }));
  for (const day of cookDays) {
    const main = mainOf(day);
    if (!main) continue;
    const clash = used.find(
      (entry) =>
        entry.recipeId === main.id &&
        Math.abs(daysBetween(entry.date, day.date)) < settings.repeatGapDays,
    );
    if (clash) {
      violations.push({
        kind: "main_repeated",
        date: day.date,
        recipeId: main.id,
      });
    }
    used.push({ recipeId: main.id, date: day.date });
  }

  /* 同カテゴリの3日連続禁止 */
  for (let i = 2; i < days.length; i += 1) {
    const window = [days[i - 2], days[i - 1], days[i]];
    if (window.some((day) => !isCooked(day))) continue;
    const categories = window.map((day) => mainOf(day)?.category);
    if (categories[0] && categories.every((c) => c === categories[0])) {
      violations.push({
        kind: "category_three_in_a_row",
        dates: window.map((day) => day.date),
      });
    }
  }

  /* アレルギーの完全除外。苦手な食材は候補から外すだけで、ここでは見ない。 */
  for (const day of cookDays) {
    for (const recipe of dishesOf(day)) {
      if (containsAvoided(recipe, settings.allergies)) {
        violations.push({
          kind: "allergy_included",
          date: day.date,
          recipeId: recipe.id,
        });
      }
    }
  }

  /* 曜日別の調理時間の上限 */
  for (const day of cookDays) {
    const main = mainOf(day);
    if (!main) continue;
    const limit = cookTimeLimit(settings, weekStart, day.date);
    if (main.cookTimeMin > limit) {
      violations.push({
        kind: "cook_time_over",
        date: day.date,
        recipeId: main.id,
        limit,
      });
    }
  }

  return violations;
}
