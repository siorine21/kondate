import assert from "node:assert/strict";
import test from "node:test";

import { generateWeek } from "../generate.ts";
import { rerollDay } from "../reroll.ts";

import { SUNDAY, defaultSettings, seedRecipes } from "./fixtures.ts";

/* リクエストされた料理が、その週に実際に入るか（変更記録 3.20）。

   決め打ち（fixedDays）とは別物。日は決めず、条件に合う範囲で
   押し上げるだけ。押し上げが弱いと「リクエストしたのに出ない」週が出るので、
   種を変えて何度も数える。 */

const recipes = seedRecipes();
const mains = recipes.filter((recipe) => recipe.dishType === "main");

function generate(
  seed: number,
  requestedMainIds: readonly string[],
  overrides: Partial<Parameters<typeof generateWeek>[0]> = {},
) {
  return generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: defaultSettings,
    request: { requestedMainIds },
    seed,
    ...overrides,
  });
}

function mainsOf(result: ReturnType<typeof generateWeek>): string[] {
  if (!result.ok) throw new Error("献立を作れなかった");
  return result.plan.days
    .map((day) => day.mainId)
    .filter((id): id is string => id !== null);
}

test("リクエストした料理が週に入る（主菜すべてを50種で試す）", () => {
  /* 30分を超える主菜は平日に置けないので、週末しか空きがない。
     それでも入ることを確かめたいので、全ての主菜を対象にする。 */
  const misses: string[] = [];
  for (const target of mains) {
    for (let seed = 1; seed <= 50; seed += 1) {
      if (!mainsOf(generate(seed, [target.id])).includes(target.id)) {
        misses.push(`${target.name} (種 ${seed})`);
      }
    }
  }
  assert.deepEqual(misses, [], `入らなかった週: ${misses.slice(0, 5).join(", ")}`);
});

test("リクエストを2つ出しても両方入る", () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const pair = [mains[0].id, mains[5].id];
    const placed = mainsOf(generate(seed, pair));
    for (const id of pair) {
      assert.ok(placed.includes(id), `種 ${seed} で ${id} が入らなかった`);
    }
  }
});

test("リクエストを入れてもハード制約は破らない", () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const result = generate(seed, [mains[0].id, mains[1].id, mains[2].id]);
    if (!result.ok) continue;
    /* 生成が自分で数えた違反をそのまま見る。画面に出るのもこれ。 */
    const violations = result.plan.violations
      /* 候補が少ないときの日数の緩和は制約違反ではない（変更記録 3.13）。 */
      .filter((v) => v.kind !== "repeat_gap_relaxed");
    assert.deepEqual(violations, [], `種 ${seed}: ${JSON.stringify(violations)}`);
  }
});

test("リクエストしていない週は今までどおり", () => {
  /* リクエストが空なら、渡さなかったときと同じ献立になること。
     既存の生成に影響を与えていないことの確認。 */
  for (let seed = 1; seed <= 20; seed += 1) {
    const withEmpty = generate(seed, []);
    const without = generateWeek({
      weekStart: SUNDAY,
      recipes,
      settings: defaultSettings,
      seed,
    });
    assert.deepEqual(mainsOf(withEmpty), mainsOf(without), `種 ${seed}`);
  }
});

test("条件に合わない料理はリクエストされても入らない", () => {
  /* アレルギー食材を含む料理は、リクエストしても除外される（7.1）。
     押し上げがハード制約を越えないことの確認。 */
  const target = mains.find((recipe) => recipe.ingredientNames.length > 0);
  if (!target) throw new Error("材料のある主菜が無い");
  const allergen = target.ingredientNames[0];

  const result = generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: { ...defaultSettings, allergies: [allergen] },
    request: { requestedMainIds: [target.id] },
    seed: 7,
  });
  if (!result.ok) return;
  assert.ok(
    !mainsOf(result).includes(target.id),
    `アレルギー食材「${allergen}」を含む ${target.name} が入ってしまった`,
  );
});

test("差し替えでもリクエストは引き継がれる", () => {
  const first = generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: defaultSettings,
    seed: 3,
  });
  if (!first.ok) throw new Error("献立を作れなかった");

  /* その週にまだ入っていない主菜をリクエストする。
     すでに入っているものは、同じ週で二度使わない決まりで候補から外れる。 */
  const placed = new Set(first.plan.days.map((day) => day.mainId));
  const target = mains.find(
    (recipe) => !placed.has(recipe.id) && recipe.cookTimeMin <= 30,
  );
  if (!target) throw new Error("リクエストできる主菜が無い");

  /* 平日の日を選んで引き直す（30分以内の主菜なら置ける）。 */
  const day = first.plan.days.find(
    (d) => d.entryType === "cook" && !d.undecided && d.mainId !== target.id,
  );
  if (!day) throw new Error("引き直せる日が無い");

  const after = rerollDay({
    plan: first.plan,
    date: day.date,
    recipes,
    settings: defaultSettings,
    request: { requestedMainIds: [target.id] },
    seed: 11,
  });
  if (!after.ok) throw new Error("差し替えに失敗した");
  const next = after.plan.days.find((d) => d.date === day.date);
  assert.equal(next?.mainId, target.id);
});

test("縮めたときは、あと何件あればよかったかを添える", () => {
  /* 主菜12件で、先週7日ぶん使った状態を作る。
     21日（3週間）空けようとすると候補が尽きる。 */
  const history = mains.slice(0, 7).map((recipe, i) => ({
    recipeId: recipe.id,
    date: `2026-08-${16 + i}`,
  }));

  const result = generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 21 },
    history,
    seed: 5,
  });
  if (!result.ok) throw new Error("献立を作れなかった");

  const relaxed = result.plan.violations.find(
    (violation) => violation.kind === "repeat_gap_relaxed",
  );
  if (relaxed?.kind !== "repeat_gap_relaxed") {
    throw new Error("縮めたのに、そのことが出ていない");
  }

  assert.equal(relaxed.from, 21);
  assert.ok(relaxed.to < 21, "縮めた先が元より短い");
  assert.ok(relaxed.need > 0, "あと何件要るかが入っている");

  /* 数が合っているか。7件使ったので候補は 12 − 7 = 5 件。
     10件に届かせるには、あと5件。 */
  const usable = mains.filter((recipe) => !history.some((h) => h.recipeId === recipe.id));
  assert.equal(relaxed.need, Math.max(0, 10 - usable.length));
});

test("主菜が足りていれば縮めず、その旨も出さない", () => {
  const result = generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 21 },
    seed: 5,
  });
  if (!result.ok) throw new Error("献立を作れなかった");
  assert.deepEqual(
    result.plan.violations.filter((v) => v.kind === "repeat_gap_relaxed"),
    [],
  );
});

test("手で選んだ日は、組み直しで上書きされない", () => {
  /* 3週間以内に作ったものを手で選び直しても、その日は動かない。
     locked な日は組み直しの対象から外れる。 */
  const target = mains[0];
  const history = [{ recipeId: target.id, date: "2026-08-20" }]; // 3日前

  const result = generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 21 },
    history,
    request: { fixedDays: [{ date: SUNDAY, recipeId: target.id }] },
    seed: 5,
  });
  if (!result.ok) throw new Error("献立を作れなかった");

  const day = result.plan.days.find((d) => d.date === SUNDAY);
  assert.equal(day?.mainId, target.id, "手で選んだ主菜がそのまま残る");
  assert.equal(day?.locked, true);
});
