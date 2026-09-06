import assert from "node:assert/strict";
import test from "node:test";

import { validateWeek } from "../constraints.ts";
import { generateWeek } from "../generate.ts";
import { SUNDAY, defaultSettings, seedRecipes } from "./fixtures.ts";

/* 和洋中の比率（変更記録 3.32）。

   設定画面で入れられるのに生成が読んでいなかった。効くようにしたので、
   本当に効いていることを数で確かめる。 */

const recipes = seedRecipes();
const byId = (id: string | null) =>
  recipes.find((recipe) => recipe.id === id) ?? null;

type Ratio = { washoku: number; yoshoku: number; chuka: number };

/* 種を振って、週あたりの和洋中の平均を数える。 */
function averages(ratio: Ratio, seeds = 40) {
  const settings = { ...defaultSettings, categoryRatio: ratio };
  const sum: Record<string, number> = { washoku: 0, yoshoku: 0, chuka: 0 };
  let weeks = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const result = generateWeek({ weekStart: SUNDAY, recipes, settings, seed });
    if (!result.ok) continue;
    weeks += 1;
    for (const day of result.plan.days) {
      const main = byId(day.mainId);
      if (main && day.entryType === "cook" && !day.undecided) {
        sum[main.category] = (sum[main.category] ?? 0) + 1;
      }
    }
  }
  return {
    washoku: sum.washoku / weeks,
    yoshoku: sum.yoshoku / weeks,
    chuka: sum.chuka / weeks,
  };
}

test("比率を変えると、出てくる和洋中の数も変わる", () => {
  const washokuHeavy = averages({ washoku: 5, yoshoku: 1, chuka: 1 });
  const yoshokuHeavy = averages({ washoku: 1, yoshoku: 5, chuka: 1 });

  assert.ok(
    washokuHeavy.washoku > yoshokuHeavy.washoku,
    `和を重くしたら和が増えるはず: ${washokuHeavy.washoku.toFixed(1)} vs ${yoshokuHeavy.washoku.toFixed(1)}`,
  );
  assert.ok(
    yoshokuHeavy.yoshoku > washokuHeavy.yoshoku,
    `洋を重くしたら洋が増えるはず: ${yoshokuHeavy.yoshoku.toFixed(1)} vs ${washokuHeavy.yoshoku.toFixed(1)}`,
  );
});

test("比率を入れてもハード制約は破らない", () => {
  for (const ratio of [
    { washoku: 5, yoshoku: 1, chuka: 1 },
    { washoku: 1, yoshoku: 5, chuka: 1 },
    { washoku: 1, yoshoku: 1, chuka: 5 },
  ]) {
    const settings = { ...defaultSettings, categoryRatio: ratio };
    for (let seed = 1; seed <= 20; seed += 1) {
      const result = generateWeek({ weekStart: SUNDAY, recipes, settings, seed });
      if (!result.ok) continue;
      const violations = validateWeek({
        weekStart: SUNDAY,
        days: result.plan.days,
        byId,
        settings,
        history: [],
      });
      assert.deepEqual(
        violations,
        [],
        `${JSON.stringify(ratio)} 種${seed}: ${JSON.stringify(violations)}`,
      );
    }
  }
});

test("比率が全て0なら、目安を持たない", () => {
  /* 0 で割らないこと。落ちずに組めれば十分。 */
  const result = generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: {
      ...defaultSettings,
      categoryRatio: { washoku: 0, yoshoku: 0, chuka: 0 },
    },
    seed: 3,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.plan.violations.filter((v) => v.kind === "category_short"),
    [],
    "目安が無いのに不足と言ってはいけない",
  );
});

test("在庫が比率に届かないときは、その旨と必要件数を出す", () => {
  /* 洋食の主菜は3件しかない。週5回は出せない。 */
  const result = generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: {
      ...defaultSettings,
      categoryRatio: { washoku: 1, yoshoku: 5, chuka: 1 },
    },
    seed: 3,
  });
  if (!result.ok) throw new Error("献立を作れなかった");

  const short = result.plan.violations.find(
    (violation) => violation.kind === "category_short",
  );
  if (short?.kind !== "category_short") {
    throw new Error("洋食が足りないのに、そのことが出ていない");
  }
  assert.equal(short.category, "yoshoku");
  assert.equal(short.have, 3, "シードの洋食の主菜は3件");
  assert.equal(short.want, 5, "5:7 の比なので週5回");
});

test("在庫が足りていれば、不足とは言わない", () => {
  /* 和6・洋3・中3。和5:洋1:中1 なら全て届く。 */
  const result = generateWeek({
    weekStart: SUNDAY,
    recipes,
    settings: {
      ...defaultSettings,
      categoryRatio: { washoku: 5, yoshoku: 1, chuka: 1 },
    },
    seed: 3,
  });
  if (!result.ok) throw new Error("献立を作れなかった");
  assert.deepEqual(
    result.plan.violations.filter((v) => v.kind === "category_short"),
    [],
  );
});
