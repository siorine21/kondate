import assert from "node:assert/strict";
import test from "node:test";

import { evaluateWeek, unmetTags } from "../nutrition.ts";
import { generateWeek } from "../planner/generate.ts";
import type { PlanDay } from "../planner/types.ts";
import { SUNDAY, defaultSettings, seedRecipes } from "../planner/__tests__/fixtures.ts";

/* 栄養評価（仕様書 10章 / Phase 5）。
   完了条件は「意図的に魚を減らした献立で未達判定が出る」。 */

const recipes = seedRecipes();
const byId = (id: string | null) =>
  recipes.find((recipe) => recipe.id === id) ?? null;
const find = (name: string) => {
  const recipe = recipes.find((r) => r.name === name);
  if (!recipe) throw new Error(`${name} がシードに無い`);
  return recipe;
};

const day = (over: Partial<PlanDay> = {}): PlanDay => ({
  date: "2026-08-23",
  entryType: "cook",
  undecided: false,
  locked: false,
  mainId: null,
  sideId: null,
  soupId: null,
  ...over,
});

test("シードから組んだ週は、週次目標をおおむね満たす", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const result = generateWeek({
      weekStart: SUNDAY,
      recipes,
      settings: defaultSettings,
      seed,
    });
    if (!result.ok) continue;
    const nutrition = evaluateWeek({ days: result.plan.days, byId });

    const fish = nutrition.goals.find((g) => g.key === "fish");
    const soy = nutrition.goals.find((g) => g.key === "soy");
    const veg = nutrition.goals.find((g) => g.key === "veg");
    const fry = nutrition.goals.find((g) => g.key === "fry");
    assert.ok(fish?.met, `種 ${seed}: 魚が ${fish?.actual} 回`);
    assert.ok(soy?.met, `種 ${seed}: 大豆が ${soy?.actual} 回`);
    assert.ok(veg?.met, `種 ${seed}: 緑黄色野菜が ${veg?.actual} 日`);
    assert.ok(fry?.met, `種 ${seed}: 揚げ物の連続が ${fry?.actual} 回`);
  }
});

test("魚を減らした献立で未達判定が出る（Phase 5 の完了条件）", () => {
  /* 魚の主菜を1日だけにする。目標は週2回。 */
  const days = [
    day({ date: "2026-08-23", mainId: find("ぶりの照り焼き").id }),
    day({ date: "2026-08-24", mainId: find("鶏の照り焼き").id }),
    day({ date: "2026-08-25", mainId: find("麻婆豆腐").id }),
    day({ date: "2026-08-26", mainId: find("鶏むね肉の甘酢炒め").id }),
    day({ date: "2026-08-27", mainId: find("豚肉と夏野菜の生姜焼き").id }),
    day({ date: "2026-08-28", mainId: find("鶏肉のトマト煮込み").id }),
    day({ date: "2026-08-29", mainId: find("なすとひき肉のキーマカレー").id }),
  ];
  const nutrition = evaluateWeek({ days, byId });
  const fish = nutrition.goals.find((g) => g.key === "fish");

  assert.equal(fish?.actual, 1);
  assert.equal(fish?.met, false, "魚1回でも達成と出てはいけない");
  assert.ok(unmetTags(nutrition).includes("魚"), "次の生成へ渡す手がかりに魚が入る");
});

test("魚が2回あれば達成になる", () => {
  const days = [
    day({ date: "2026-08-23", mainId: find("ぶりの照り焼き").id }),
    day({ date: "2026-08-24", mainId: find("白身魚のムニエル").id }),
  ];
  const nutrition = evaluateWeek({ days, byId });
  assert.equal(nutrition.goals.find((g) => g.key === "fish")?.met, true);
});

test("外食と未定の日は分母から外す", () => {
  /* 3日だけ自炊し、その全てに緑黄色野菜があれば「毎日」を満たす。
     7で割ると、外食の多い週ほど不当に低く出る。 */
  const green = find("ほうれん草の白和え"); // 3群を含む副菜
  const days = [
    day({ date: "2026-08-23", mainId: find("鶏の照り焼き").id, sideId: green.id }),
    day({ date: "2026-08-24", mainId: find("麻婆豆腐").id, sideId: green.id }),
    day({ date: "2026-08-25", mainId: find("ぶりの照り焼き").id, sideId: green.id }),
    day({ date: "2026-08-26", entryType: "eatout" }),
    day({ date: "2026-08-27", entryType: "eatout" }),
    day({ date: "2026-08-28", undecided: true }),
    day({ date: "2026-08-29", undecided: true }),
  ];
  const nutrition = evaluateWeek({ days, byId });

  assert.equal(nutrition.cookDays, 3);
  assert.equal(nutrition.days[3], 3);
  assert.equal(nutrition.coverage[3], 1, "3日中3日なら100%");
  assert.equal(nutrition.goals.find((g) => g.key === "veg")?.met, true);
});

test("緑黄色野菜が1日でも欠けると未達", () => {
  const green = find("ほうれん草の白和え");
  const days = [
    day({ date: "2026-08-23", mainId: find("鶏の照り焼き").id, sideId: green.id }),
    /* 副菜を付けない日。主菜に3群が無ければ欠ける。 */
    day({ date: "2026-08-24", mainId: find("麻婆豆腐").id }),
  ];
  const nutrition = evaluateWeek({ days, byId });
  const veg = nutrition.goals.find((g) => g.key === "veg");
  assert.equal(veg?.met, false);
  assert.ok(unmetTags(nutrition).includes("緑黄色野菜"));
});

test("和洋中の配分を数える", () => {
  const days = [
    day({ date: "2026-08-23", mainId: find("鶏の照り焼き").id }),       // 和
    day({ date: "2026-08-24", mainId: find("ぶりの照り焼き").id }),     // 和
    day({ date: "2026-08-25", mainId: find("麻婆豆腐").id }),           // 中
    day({ date: "2026-08-26", mainId: find("鶏肉のトマト煮込み").id }), // 洋
  ];
  const mix = evaluateWeek({ days, byId }).categoryMix;
  const of = (c: string) => mix.find((m) => m.category === c)?.count ?? 0;
  assert.equal(of("washoku"), 2);
  assert.equal(of("chuka"), 1);
  assert.equal(of("yoshoku"), 1);
});

test("献立が空でも落ちない", () => {
  const nutrition = evaluateWeek({ days: [], byId });
  assert.equal(nutrition.cookDays, 0);
  assert.equal(nutrition.coverage[1], 0);
  assert.equal(nutrition.categoryMix.length, 0);
  /* 品が無いなら「毎日」は満たしていない。 */
  assert.equal(nutrition.goals.find((g) => g.key === "veg")?.met, false);
});

test("揚げ物が2日続くと未達", () => {
  const fry = recipes.find((r) => r.dishType === "main" && r.method === "fry");
  if (!fry) return; // シードに揚げ物が無ければ見ない
  const days = [
    day({ date: "2026-08-23", mainId: fry.id }),
    day({ date: "2026-08-24", mainId: fry.id }),
  ];
  const nutrition = evaluateWeek({ days, byId });
  assert.equal(nutrition.goals.find((g) => g.key === "fry")?.met, false);
});
