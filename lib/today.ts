import type { PlanDay, PlannerRecipe } from "./planner/types.ts";

/* 今日の献立（仕様書 5.2-2 / Phase 7）。

   純粋関数。Supabase を import しない（仕様書 2.3）。 */

/* 端末の日付を yyyy-mm-dd で返す。UTC ではなく手元の日付で見る。
   日付が変わる時刻に、前の日の献立を出さないため。 */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function findDay(
  days: readonly PlanDay[],
  date: string,
): PlanDay | null {
  return days.find((day) => day.date === date) ?? null;
}

/* 明日の下ごしらえに添える一言。

   レシピの調理メモがあればそれを、無ければ肉・魚の解凍だけ伝える。
   何も言うことが無ければ null を返し、カードに空の行を作らない。

   メモは献立生成には要らない値なので、PlannerRecipe には持たせず、
   ここで別に受け取る（仕様書 2.3 の境界を保つ）。 */
export function prepNote(
  recipe: PlannerRecipe | null,
  memo: string | null,
): string | null {
  if (!recipe) return null;
  if (memo !== null && memo.trim() !== "") return memo.trim();
  if (recipe.mainProtein === "meat" || recipe.mainProtein === "fish") {
    return "冷凍しているなら、今夜のうちに冷蔵庫へ移しておきます。";
  }
  return null;
}
