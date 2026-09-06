import assert from "node:assert/strict";
import test from "node:test";

import { assessLibrary } from "../library.ts";
import { MEAT_LABEL } from "../meat.ts";
import { defaultSettings, seedRecipes } from "../planner/__tests__/fixtures.ts";

/* レシピ帳の在庫（変更記録 3.33）。 */

const recipes = seedRecipes();

test("目標は、空ける日数から出す", () => {
  /* 14日（2週）なら 肉3×2=6、魚2×2=4、卵1×2=2、大豆1×2=2。 */
  const two = assessLibrary({
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 14 },
  });
  assert.equal(two.weeks, 2);
  const want = (key: string) => two.protein.find((p) => p.key === key)?.want;
  assert.equal(want("meat"), 6);
  assert.equal(want("fish"), 4);
  assert.equal(want("egg"), 2);
  assert.equal(want("soy"), 2);

  /* 21日（3週）なら 1.5 倍。設定を変えれば目標も伸びる。 */
  const three = assessLibrary({
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 21 },
  });
  assert.equal(three.weeks, 3);
  assert.equal(three.protein.find((p) => p.key === "meat")?.want, 9);
  assert.equal(three.protein.find((p) => p.key === "fish")?.want, 6);
});

test("シードの在庫を正しく数える", () => {
  const lib = assessLibrary({
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 21 },
  });
  const have = (key: string) => lib.protein.find((p) => p.key === key)?.have;
  assert.equal(lib.totalMains, 12);
  assert.equal(have("meat"), 5);
  assert.equal(have("fish"), 4);
  assert.equal(have("soy"), 2);
  assert.equal(have("egg"), 1);
});

test("足りているか、もう少しか、足りないかを分ける", () => {
  const lib = assessLibrary({
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 21 },
  });
  /* 魚 4/6 は7割（4.2）に届かないので「足りない」。 */
  assert.equal(lib.protein.find((p) => p.key === "fish")?.level, "short");
  /* 肉 5/9 も足りない。 */
  assert.equal(lib.protein.find((p) => p.key === "meat")?.level, "short");

  /* 目標に届いていれば ok。 */
  const easy = assessLibrary({
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 7 },
  });
  assert.equal(easy.protein.find((p) => p.key === "fish")?.level, "ok", "魚4件で週2回なら足りている");
  assert.equal(easy.protein.find((p) => p.key === "meat")?.level, "ok", "肉5件で週3回なら足りている");
});

test("平日に作れる主菜を数える", () => {
  const lib = assessLibrary({
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 14, weekdayMaxMinutes: 30 },
  });
  /* 30分以内の主菜は10件。平日は 5×2週=10 要る。 */
  assert.equal(lib.weekday.have, 10);
  assert.equal(lib.weekday.want, 10);
  assert.equal(lib.weekday.level, "ok");

  /* 上限を20分にすると、作れる主菜が減る。 */
  const strict = assessLibrary({
    recipes,
    settings: { ...defaultSettings, repeatGapDays: 14, weekdayMaxMinutes: 20 },
  });
  assert.ok(strict.weekday.have < lib.weekday.have, "上限を厳しくすれば減る");
  assert.ok(strict.weekday.label.includes("20分"), "上限を文言に出す");
});

test("肉の内訳を数える", () => {
  const lib = assessLibrary({ recipes, settings: defaultSettings });
  const of = (kind: string) =>
    lib.meatMix.find((row) => row.kind === kind)?.count ?? 0;
  /* シードの肉の主菜5件は 鶏3・豚1・合いびき1。牛は0件。 */
  assert.equal(of("chicken"), 3);
  assert.equal(of("pork"), 1);
  assert.equal(of("mixed"), 1);
  assert.equal(of("beef"), 0, "牛は無いので並ばない");
  assert.equal(lib.meatMix.reduce((s, r) => s + r.count, 0), 5, "肉の主菜の数と合う");
  /* 0件のものは並べない。足りない、とは言えないため。 */
  assert.ok(!lib.meatMix.some((row) => row.count === 0));
  assert.ok(MEAT_LABEL.chicken === "鶏");
});

test("レシピが1件も無くても落ちない", () => {
  const lib = assessLibrary({ recipes: [], settings: defaultSettings });
  assert.equal(lib.totalMains, 0);
  assert.equal(lib.meatMix.length, 0);
  assert.ok(lib.protein.every((row) => row.have === 0 && row.level === "short"));
});
