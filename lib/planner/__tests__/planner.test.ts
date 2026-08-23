import assert from "node:assert/strict";
import test from "node:test";

import { validateWeek } from "../constraints.ts";
import { generateWeek, weekDates } from "../generate.ts";
import { rerollDay } from "../reroll.ts";
import type { PlanDay, PlannerRecipe } from "../types.ts";

import { SUNDAY, defaultSettings, seedRecipes } from "./fixtures.ts";

/* 仕様書 13 章の方針にそって、生成アルゴリズムだけを見る。
   画面のテストは書かない。 */

const recipes = seedRecipes();
const byId = (id: string | null) =>
  recipes.find((recipe) => recipe.id === id) ?? null;

function generate(seed: number, overrides: Partial<Parameters<typeof generateWeek>[0]> = {}) {
  return generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: defaultSettings,
    seed,
    ...overrides,
  });
}

test("週の起点は日曜で、7日ぶん返る", () => {
  const dates = weekDates(SUNDAY);
  assert.equal(dates.length, 7);
  assert.equal(new Date(`${SUNDAY}T00:00:00Z`).getUTCDay(), 0);
  assert.equal(dates[6], "2026-08-29");
});

test("シード20件から7日分が生成され、ハード制約を全て満たす", () => {
  /* 1回きりの当たりで通っていないか、種を変えて何度も確かめる。 */
  for (let seed = 1; seed <= 50; seed += 1) {
    const result = generate(seed);
    if (!result.ok) return;

    const { plan } = result;
    assert.equal(plan.days.length, 7);
    for (const day of plan.days) {
      assert.ok(day.mainId, `seed=${seed} ${day.date} の主菜が空`);
      assert.ok(day.sideId, `seed=${seed} ${day.date} の副菜が空`);
      assert.ok(day.soupId, `seed=${seed} ${day.date} の汁物が空`);
    }
    assert.deepEqual(
      plan.violations,
      [],
      `seed=${seed} で満たせない制約が残った: ${JSON.stringify(plan.violations)}`,
    );
  }
});

test("週次目標そのものを数え直しても満たしている", () => {
  const result = generate(7);
  if (!result.ok) throw new Error("生成できなかった");
  const { days } = result.plan;

  const fish = days.filter((d) => byId(d.mainId)?.mainProtein === "fish").length;
  assert.ok(fish >= 2, `魚が週${fish}回`);

  const soy = days.filter((d) =>
    [byId(d.mainId), byId(d.sideId)].some((r) => r?.mainProtein === "soy"),
  ).length;
  assert.ok(soy >= 2, `大豆が週${soy}回`);

  for (const day of days) {
    const groups = [byId(day.mainId), byId(day.sideId), byId(day.soupId)]
      .filter((r): r is PlannerRecipe => r !== null)
      .flatMap((r) => r.foodGroups);
    assert.ok(groups.includes(3), `${day.date} に緑黄色野菜がない`);
  }

  /* 平日は30分以内（既定値）。日曜始まりなので月〜金は 1〜5 番目。 */
  for (const day of days.slice(1, 6)) {
    const main = byId(day.mainId);
    assert.ok(main && main.cookTimeMin <= 30, `${day.date} が平日の上限を超えた`);
  }

  /* 同じ主菜は週内で重複しない。 */
  const mainIds = days.map((d) => d.mainId);
  assert.equal(new Set(mainIds).size, mainIds.length, "同じ主菜が週内に出た");
});

test("同じ副菜・汁物が3日続かない", () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const result = generate(seed);
    if (!result.ok) throw new Error(`seed=${seed} で生成できなかった`);
    const { days } = result.plan;

    for (let i = 2; i < days.length; i += 1) {
      const sides = [days[i - 2].sideId, days[i - 1].sideId, days[i].sideId];
      const soups = [days[i - 2].soupId, days[i - 1].soupId, days[i].soupId];
      assert.ok(
        new Set(sides).size > 1,
        `seed=${seed} で副菜が3日続けて同じ（${sides[0]}）`,
      );
      assert.ok(
        new Set(soups).size > 1,
        `seed=${seed} で汁物が3日続けて同じ（${soups[0]}）`,
      );
    }
  }
});

test("アレルギー食材を含むレシピは完全に除外される", () => {
  const settings = { ...defaultSettings, allergies: ["鮭", "ぶり"] };
  const result = generate(3, { settings });
  if (!result.ok) throw new Error("生成できなかった");

  for (const day of result.plan.days) {
    for (const id of [day.mainId, day.sideId, day.soupId]) {
      const recipe = byId(id);
      if (!recipe) continue;
      for (const name of recipe.ingredientNames) {
        assert.ok(
          !name.includes("鮭") && !name.includes("ぶり"),
          `${day.date} の ${recipe.name} に ${name} が入っている`,
        );
      }
    }
  }
  assert.deepEqual(result.plan.violations, []);
});

test("locked な日は再生成しても変わらない", () => {
  const fixedDays = [{ date: "2026-08-28", recipeId: "麻婆豆腐" }];

  for (let seed = 1; seed <= 20; seed += 1) {
    const result = generate(seed, { request: { fixedDays } });
    if (!result.ok) throw new Error("生成できなかった");

    const friday = result.plan.days.find((d) => d.date === "2026-08-28");
    assert.equal(friday?.mainId, "麻婆豆腐", `seed=${seed} で固定枠が動いた`);
    assert.equal(friday?.locked, true);
  }
});

test("自炊しない日には品を入れない", () => {
  const result = generate(5, {
    request: {
      noCookDays: [{ date: "2026-08-26", entryType: "eatout" }],
    },
  });
  if (!result.ok) throw new Error("生成できなかった");

  const day = result.plan.days.find((d) => d.date === "2026-08-26");
  assert.equal(day?.entryType, "eatout");
  assert.equal(day?.mainId, null);
  assert.equal(day?.sideId, null);
  assert.equal(day?.soupId, null);
});

test("主菜が足りないときは、不足件数を添えて断る", () => {
  const few = recipes.filter(
    (recipe) => recipe.dishType !== "main" || recipe.name === "麻婆豆腐",
  );
  const result = generateWeek({
    weekStart: SUNDAY,
    recipes: few,
    settings: defaultSettings,
    seed: 1,
  });

  if (result.ok) throw new Error("足りないのに生成してしまった");
  assert.equal(result.reason, "not_enough_mains");
  assert.equal(result.total, 1);
  assert.equal(result.need, 10);
});

test("同じ種なら同じ結果になる", () => {
  const a = generate(42);
  const b = generate(42);
  const c = generate(43);
  if (!a.ok || !b.ok || !c.ok) throw new Error("生成できなかった");

  assert.deepEqual(a.plan.days, b.plan.days, "同じ種で結果が変わった");
  assert.notDeepEqual(a.plan.days, c.plan.days, "種を変えても結果が同じ");
});

test("直近に使った主菜は間隔が空くまで出ない", () => {
  const history = [
    { recipeId: "鶏の照り焼き", date: "2026-08-20" },
    { recipeId: "麻婆豆腐", date: "2026-08-18" },
  ];
  const result = generate(9, { history });
  if (!result.ok) throw new Error("生成できなかった");

  const used = result.plan.days.map((d) => d.mainId);
  assert.ok(!used.includes("鶏の照り焼き"));
  assert.ok(!used.includes("麻婆豆腐"));
  assert.deepEqual(result.plan.violations, []);
});

test("手で選んだ副菜は、組み直しても残る", () => {
  const date = "2026-08-26";
  const result = generate(13, {
    request: {
      fixedSides: [{ date, recipeId: "もやしのナムル" }],
    },
  });
  if (!result.ok) throw new Error("生成できなかった");

  const day = result.plan.days.find((d) => d.date === date);
  assert.equal(day?.sideId, "もやしのナムル");
});

test("副菜をつけない日を作れる", () => {
  const date = "2026-08-26";
  const result = generate(14, {
    request: { fixedSides: [{ date, recipeId: null }] },
  });
  if (!result.ok) throw new Error("生成できなかった");

  const day = result.plan.days.find((d) => d.date === date);
  assert.equal(day?.sideId, null);
  /* 汁物は自動のまま残る。 */
  assert.ok(day?.soupId);
});

test("日曜と土曜が休日、月〜金が平日として扱われる", () => {
  const result = generate(15);
  if (!result.ok) throw new Error("生成できなかった");
  const { days } = result.plan;

  assert.equal(new Date(`${days[0].date}T00:00:00Z`).getUTCDay(), 0, "1日目が日曜でない");
  assert.equal(new Date(`${days[6].date}T00:00:00Z`).getUTCDay(), 6, "7日目が土曜でない");

  for (const day of days.slice(1, 6)) {
    const main = recipes.find((r) => r.id === day.mainId);
    assert.ok(
      main && main.cookTimeMin <= 30,
      `${day.date} は平日なのに ${main?.cookTimeMin}分`,
    );
  }
});

test("先週使った主菜で候補が尽きても、間隔を縮めて組む", () => {
  /* 実際に起きた状況の再現。
     主菜が12件あり、先週6日ぶん使うと残りは6件。
     14日空ける決まりのままだと候補が10件に届かず、以前は組めなかった。 */
  const usedLastWeek = recipes
    .filter((recipe) => recipe.dishType === "main")
    .slice(0, 6)
    .map((recipe, index) => ({
      recipeId: recipe.id,
      date: `2026-08-${17 + index}`,
    }));

  const result = generate(31, { history: usedLastWeek });
  if (!result.ok) throw new Error("候補が尽きたまま組めなかった");

  for (const day of result.plan.days) {
    assert.ok(day.mainId, `${day.date} の主菜が空`);
  }

  const relaxed = result.plan.violations.find(
    (v) => v.kind === "repeat_gap_relaxed",
  );
  assert.ok(relaxed, "間隔を縮めたことが伝わっていない");
  if (relaxed?.kind === "repeat_gap_relaxed") {
    assert.equal(relaxed.from, 14);
    assert.ok(relaxed.to < 14 && relaxed.to >= 0);
  }
});

test("候補が足りているときは、間隔を縮めない", () => {
  const result = generate(32);
  if (!result.ok) throw new Error("生成できなかった");
  assert.ok(
    !result.plan.violations.some((v) => v.kind === "repeat_gap_relaxed"),
    "縮める必要がないのに縮めている",
  );
});

test("1日差し替えは、その日だけ変えて他の日を残す", () => {
  const first = generate(11);
  if (!first.ok) throw new Error("生成できなかった");

  const date = "2026-08-26";
  const before = first.plan.days.find((d) => d.date === date);
  const rerolled = rerollDay({
    plan: structuredClone(first.plan),
    date,
    recipes,
    settings: defaultSettings,
    seed: 12,
  });
  if (!rerolled.ok) throw new Error("生成できなかった");

  const after = rerolled.plan.days.find((d) => d.date === date);
  assert.notEqual(after?.mainId, before?.mainId, "主菜が変わっていない");

  for (const day of first.plan.days) {
    if (day.date === date) continue;
    /* assert.equal は引数の型を絞り込むため、注釈が無いと推論が循環する。 */
    const same: PlanDay | undefined = rerolled.plan.days.find(
      (d) => d.date === day.date,
    );
    assert.equal(same?.mainId, day.mainId, `${day.date} が巻き添えで変わった`);
  }
  assert.deepEqual(rerolled.plan.violations, []);
});

test("制約の検査そのものが働いている（わざと壊して確かめる）", () => {
  const result = generate(21);
  if (!result.ok) throw new Error("生成できなかった");

  /* 全部の主菜を同じ和食の肉料理にすると、魚も大豆も足りなくなる。 */
  const broken = result.plan.days.map((day) => ({
    ...day,
    mainId: "鶏の照り焼き",
  }));
  const violations = validateWeek({
    weekStart: SUNDAY,
    days: broken,
    byId,
    settings: defaultSettings,
    history: [],
  });

  const kinds = new Set(violations.map((v) => v.kind));
  assert.ok(kinds.has("fish_shortage"), "魚の不足を見逃した");
  assert.ok(kinds.has("main_repeated"), "同じ主菜の連続を見逃した");
  assert.ok(
    kinds.has("category_three_in_a_row"),
    "同カテゴリの3日連続を見逃した",
  );
});
