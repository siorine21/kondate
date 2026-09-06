import { MIN_MAIN_POOL, PROTEIN_TARGET } from "./planner/generate.ts";
import type { PlannerRecipe, PlannerSettings } from "./planner/types.ts";
import { MEAT_ORDER, type MeatKind } from "./meat.ts";

/* レシピ帳の在庫を測る（変更記録 3.33）。

   「どの主菜が足りないか」に答える。今週の食卓を見る栄養サマリ（10章）とは別で、
   こちらはレシピ帳そのものを見る。

   目標は献立生成の数字から出す。週の配分（7.2 の PROTEIN_TARGET）を、
   同じ主菜を空ける日数のぶんだけ掛ける。設定を21日にすれば目標も伸びる。
   ここで独自の数字を決めない。

   純粋関数。Supabase を import しない（仕様書 2.3）。 */

export type Level = "ok" | "low" | "short";

export type Stock = {
  key: string;
  label: string;
  have: number;
  want: number;
  level: Level;
};

export type Library = {
  /* 何週ぶんを目標にしているか。空ける日数から出す。 */
  weeks: number;
  totalMains: number;
  /* 候補が尽きないために要る主菜の総数。 */
  wantMains: number;
  protein: Stock[];
  /* 平日に作れる主菜。平日は7日のうち5日。 */
  weekday: Stock;
  /* 肉の主菜の内訳。目標は無いので、数だけ出す。 */
  meatMix: { kind: MeatKind; label: string; count: number }[];
};

const PROTEIN_LABEL: Readonly<Record<string, string>> = {
  meat: "肉",
  fish: "魚",
  egg: "卵",
  soy: "大豆",
};

/* 7割に届いていれば「もう少し」。それ未満は「足りない」。 */
function levelOf(have: number, want: number): Level {
  if (want <= 0 || have >= want) return "ok";
  return have >= want * 0.7 ? "low" : "short";
}

export function assessLibrary(input: {
  recipes: readonly PlannerRecipe[];
  settings: PlannerSettings;
}): Library {
  const { recipes, settings } = input;
  const mains = recipes.filter((recipe) => recipe.dishType === "main");

  /* 空ける日数を週に直す。14日なら2週、21日なら3週。 */
  const weeks = Math.max(1, Math.ceil(settings.repeatGapDays / 7));

  const protein = Object.entries(PROTEIN_TARGET).map(([key, perWeek]) => {
    const want = perWeek * weeks;
    const have = mains.filter((recipe) => recipe.mainProtein === key).length;
    return {
      key,
      label: PROTEIN_LABEL[key] ?? key,
      have,
      want,
      level: levelOf(have, want),
    };
  });

  /* 平日は7日のうち5日。その日は調理時間の上限がある。 */
  const weekdayWant = 5 * weeks;
  const weekdayHave = mains.filter(
    (recipe) => recipe.cookTimeMin <= settings.weekdayMaxMinutes,
  ).length;

  const counts = new Map<MeatKind, number>();
  for (const recipe of mains) {
    if (recipe.mainProtein !== "meat" || recipe.meatKind === null) continue;
    counts.set(recipe.meatKind, (counts.get(recipe.meatKind) ?? 0) + 1);
  }

  return {
    weeks,
    totalMains: mains.length,
    /* 週ぶんの合計に、候補が尽きないためのゆとりを足す。 */
    wantMains: protein.reduce((sum, row) => sum + row.want, 0) + MIN_MAIN_POOL,
    protein,
    weekday: {
      key: "weekday",
      label: `平日に作れる（${settings.weekdayMaxMinutes}分以内）`,
      have: weekdayHave,
      want: weekdayWant,
      level: levelOf(weekdayHave, weekdayWant),
    },
    meatMix: MEAT_ORDER.map((kind) => ({
      kind,
      label: kind,
      count: counts.get(kind) ?? 0,
    })).filter((row) => row.count > 0),
  };
}
