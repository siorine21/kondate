import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { meatKindOf, meatOf } from "../meat.ts";

/* 肉の種類の見分け（変更記録 3.33）。 */

test("材料ひとつを見分ける", () => {
  assert.equal(meatOf("鶏もも肉"), "chicken");
  assert.equal(meatOf("鶏むね肉"), "chicken");
  assert.equal(meatOf("ささみ"), "chicken");
  assert.equal(meatOf("豚ロース薄切り肉"), "pork");
  assert.equal(meatOf("豚こま切れ肉"), "pork");
  assert.equal(meatOf("ベーコン"), "pork");
  assert.equal(meatOf("牛こま切れ肉"), "beef");
  assert.equal(meatOf("合いびき肉"), "mixed");
  assert.equal(meatOf("ラム肉"), "other");
});

test("肉でないものを肉と間違えない", () => {
  /* 「牛乳」は「牛」を含むが肉ではない。 */
  assert.equal(meatOf("牛乳"), null);
  assert.equal(meatOf("玉ねぎ"), null);
  assert.equal(meatOf("木綿豆腐"), null);
  assert.equal(meatOf("生鮭"), null);
  assert.equal(meatOf("卵"), null);
  assert.equal(meatOf(""), null);
});

test("レシピは、材料の並び順で最初に当たった肉を主役とする", () => {
  assert.equal(meatKindOf(["鶏もも肉", "玉ねぎ", "醤油"]), "chicken");
  /* ベーコンより先に鶏があれば鶏。主菜は主役の肉を先に書く。 */
  assert.equal(meatKindOf(["鶏むね肉", "ベーコン"]), "chicken");
  assert.equal(meatKindOf(["ベーコン", "鶏むね肉"]), "pork");
  /* 肉が無ければ null。 */
  assert.equal(meatKindOf(["生鮭", "バター"]), null);
  assert.equal(meatKindOf([]), null);
  /* 牛乳だけなら肉ではない。 */
  assert.equal(meatKindOf(["牛乳", "小麦粉"]), null);
});

test("シードの肉の主菜が、すべて種類まで分かる", () => {
  const seedPath = path.join(
    import.meta.dirname,
    "../../supabase/setup/seed-recipes.json",
  );
  const parsed: unknown = JSON.parse(readFileSync(seedPath, "utf8"));
  if (
    typeof parsed !== "object" || parsed === null ||
    !("recipes" in parsed) || !Array.isArray(parsed.recipes)
  ) {
    throw new Error("シードの形が想定と違います");
  }

  const unknown: string[] = [];
  for (const recipe of parsed.recipes) {
    if (recipe.dish_type !== "main" || recipe.main_protein !== "meat") continue;
    const names: string[] = recipe.ingredients.map(
      (ing: { name: string }) => ing.name,
    );
    if (meatKindOf(names) === null) unknown.push(recipe.name);
  }
  assert.deepEqual(unknown, [], "肉の主菜なのに種類が分からない");
});
