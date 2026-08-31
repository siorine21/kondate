import assert from "node:assert/strict";
import test from "node:test";

import { findDay, prepNote, todayIso } from "../today.ts";
import type { PlanDay } from "../planner/types.ts";
import { seedRecipes } from "../planner/__tests__/fixtures.ts";

/* 今日の献立（仕様書 5.2-2 / Phase 7）。 */

const recipes = seedRecipes();
const named = (name: string) => {
  const recipe = recipes.find((r) => r.name === name);
  if (!recipe) throw new Error(`${name} がシードに無い`);
  return recipe;
};

const day = (date: string, over: Partial<PlanDay> = {}): PlanDay => ({
  date,
  entryType: "cook",
  undecided: false,
  locked: false,
  mainId: null,
  sideId: null,
  soupId: null,
  ...over,
});

test("今日の日付は端末の日付で出す", () => {
  /* UTC で見ると、日本時間の朝9時までは前の日になってしまう。 */
  const morning = new Date(2026, 7, 30, 0, 30); // 8/30 の 0:30（手元の時刻）
  assert.equal(todayIso(morning), "2026-08-30");
  const night = new Date(2026, 7, 30, 23, 45);
  assert.equal(todayIso(night), "2026-08-30");
  /* 1桁の月日も0で埋める。 */
  assert.equal(todayIso(new Date(2026, 0, 5)), "2026-01-05");
});

test("日付から その日を引く", () => {
  const days = [day("2026-08-30"), day("2026-08-31")];
  assert.equal(findDay(days, "2026-08-31")?.date, "2026-08-31");
  assert.equal(findDay(days, "2026-09-01"), null);
  assert.equal(findDay([], "2026-08-30"), null);
});

test("下ごしらえの一言", () => {
  const meat = named("鶏の照り焼き");
  const fish = named("ぶりの照り焼き");
  const soy = named("麻婆豆腐");

  /* 調理メモがあれば、それをそのまま出す。 */
  assert.equal(prepNote(meat, "前日にタレへ漬けます"), "前日にタレへ漬けます");
  /* 空白だけのメモは無いものとして扱う。 */
  assert.equal(
    prepNote(meat, "   "),
    "冷凍しているなら、今夜のうちに冷蔵庫へ移しておきます。",
  );
  /* メモが無ければ、肉と魚だけ解凍を伝える。 */
  assert.ok(prepNote(fish, null)?.includes("冷蔵庫"));
  /* 大豆は解凍が要らないので、言うことが無ければ何も出さない。 */
  assert.equal(prepNote(soy, null), null);
  /* 主菜が決まっていない日は何も出さない。 */
  assert.equal(prepNote(null, "何か"), null);
});
