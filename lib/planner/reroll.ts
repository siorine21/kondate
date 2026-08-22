import { generateWeek } from "./generate.ts";
import type {
  GeneratedPlan,
  MainHistory,
  PlanRequest,
  PlanResult,
  PlannerRecipe,
  PlannerSettings,
} from "./types.ts";

/* 1日差し替え（仕様書 7.3）。

   対象日の主菜だけを引き直す。前後の日はそのまま残す。
   いま入っているレシピは候補から外す。
   副菜と汁物は、新しい主菜の食品群に応じて組み直される。 */

export function rerollDay(input: {
  plan: GeneratedPlan;
  date: string;
  recipes: readonly PlannerRecipe[];
  settings: PlannerSettings;
  history?: readonly MainHistory[];
  ratings?: Readonly<Record<string, number>>;
  request?: PlanRequest;
  seed: number;
}): PlanResult {
  const { plan, date, recipes, settings, history = [], ratings = {}, request = {}, seed } = input;

  const target = plan.days.find((day) => day.date === date);
  if (!target || target.entryType !== "cook") {
    return { ok: true, plan };
  }

  /* 対象日以外を固定枠にすると、生成の仕組みをそのまま使い回せる。 */
  const fixedDays = plan.days
    .filter((day) => day !== target && day.entryType === "cook" && day.mainId)
    .map((day) => ({ date: day.date, recipeId: day.mainId ?? "" }));

  const noCookDays = plan.days
    .filter((day) => day.entryType !== "cook")
    .map((day) => ({ date: day.date, entryType: day.entryType }));

  /* いま入っているものは選び直さない（7.3）。 */
  const withoutCurrent = recipes.filter(
    (recipe) => recipe.id !== target.mainId,
  );

  const result = generateWeek({
    weekStart: plan.weekStart,
    recipes: withoutCurrent,
    settings,
    history,
    ratings,
    request: { ...request, fixedDays, noCookDays },
    seed,
  });

  if (!result.ok) return result;

  /* 固定枠として渡した日の locked は、元の状態に戻す。
     差し替えのために立てた印であって、利用者が固定したものではない。 */
  const lockedByUser = new Set(
    plan.days.filter((day) => day.locked).map((day) => day.date),
  );
  for (const day of result.plan.days) {
    day.locked = lockedByUser.has(day.date);
  }

  return result;
}
