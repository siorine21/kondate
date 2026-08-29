import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { GREEN_YELLOW, groupOf, guessFoodGroups } from "../food-groups.ts";

/* 食品群の自動判定（変更記録 3.21）。
   毎日の緑黄色野菜（7.1）の判定がここに乗るので、取り違えは献立に響く。 */

test("材料ひとつを見分ける", () => {
  assert.equal(groupOf("鶏もも肉"), 1);
  assert.equal(groupOf("生鮭"), 1);
  assert.equal(groupOf("卵"), 1);
  assert.equal(groupOf("木綿豆腐"), 1);
  assert.equal(groupOf("乾燥わかめ"), 2);
  assert.equal(groupOf("ほうれん草"), 3);
  assert.equal(groupOf("にんじん"), 3);
  assert.equal(groupOf("キャベツ"), 4);
  assert.equal(groupOf("しめじ"), 4);
  assert.equal(groupOf("ごはん"), 5);
  assert.equal(groupOf("じゃがいも"), 5);
  assert.equal(groupOf("サラダ油"), 6);
  assert.equal(groupOf("バター"), 6);
});

test("調味料と水には群が付かない", () => {
  for (const name of ["塩", "こしょう", "醤油", "味噌", "酢", "酒", "みりん", "水", "だし汁", "豆板醤", "カレー粉", "ローリエ"]) {
    assert.equal(groupOf(name), 0, `${name} に群が付いた`);
  }
});

test("紛らわしい名前を取り違えない", () => {
  /* 緑黄色野菜（3群）と、その他の野菜（4群）の境目。 */
  assert.equal(groupOf("万能ねぎ"), 3, "青いねぎは緑黄色野菜");
  assert.equal(groupOf("長ねぎ"), 4, "白いねぎは緑黄色野菜ではない");
  assert.equal(groupOf("玉ねぎ"), 4);
  /* トマトは3群だが、ケチャップは調味料。 */
  assert.equal(groupOf("トマト"), 3);
  assert.equal(groupOf("カットトマト缶"), 3);
  assert.equal(groupOf("トマトケチャップ"), 0);
  /* かつお節は魚だが、位置づけは2群（小魚）。 */
  assert.equal(groupOf("かつお節"), 2);
  assert.equal(groupOf("かつお"), 1);
  /* ごま油は6群。醤油は調味料で、どちらも「油」を含む。 */
  assert.equal(groupOf("ごま油"), 6);
  assert.equal(groupOf("醤油"), 0);
  /* 水菜は3群。「水」を含むが、水そのものとは別。 */
  assert.equal(groupOf("水菜"), 3);
  assert.equal(groupOf("水"), 0);
  /* のりは海藻なので2群。緑黄色野菜ではない。 */
  assert.equal(groupOf("焼きのり"), 2);
  /* 大根は4群だが、大根の葉は3群。 */
  assert.equal(groupOf("大根"), 4);
  assert.equal(groupOf("大根の葉"), 3);
  /* 油揚げ・厚揚げは大豆製品（1群）。油ではない。 */
  assert.equal(groupOf("油揚げ"), 1);
  assert.equal(groupOf("厚揚げ"), 1);
  /* 揚げ油は6群。 */
  assert.equal(groupOf("揚げ油"), 6);
});

test("少量しか使わないものは数えない", () => {
  /* 六群では砂糖と粉類は5群だが、小さじ数杯の調味料・衣として使うだけで、
     5群として数えるとほぼ全ての和食が5群持ちになる。主食だけを数える。 */
  assert.equal(groupOf("砂糖"), 0);
  assert.equal(groupOf("小麦粉"), 0);
  assert.equal(groupOf("片栗粉"), 0);
  assert.equal(groupOf("ごはん"), 5);
  assert.equal(groupOf("じゃがいも"), 5);
  /* 薬味も同じ。ひとかけを野菜1品として数えない。 */
  assert.equal(groupOf("にんにく"), 0);
  assert.equal(groupOf("しょうが"), 0);
  /* ごまは種実で脂質源なので数える。 */
  assert.equal(groupOf("すりごま"), 6);
});

test("レシピの材料からまとめて出す", () => {
  assert.deepEqual(
    guessFoodGroups(["鶏もも肉", "醤油", "みりん", "サラダ油", "ほうれん草"]),
    [1, 3, 6],
  );
  /* 重なっても1つにまとまり、小さい順に並ぶ。 */
  assert.deepEqual(guessFoodGroups(["にんじん", "ピーマン", "卵"]), [1, 3]);
  /* 調味料だけなら空。 */
  assert.deepEqual(guessFoodGroups(["塩", "こしょう"]), []);
  assert.deepEqual(guessFoodGroups([]), []);
});

test("緑黄色野菜の一覧に重複が無く、全て3群と判定される", () => {
  const all = GREEN_YELLOW.flatMap((row) => row.items);
  assert.equal(new Set(all).size, all.length, "同じ食材が2回出ている");
  const wrong = all.filter((name) => groupOf(name) !== 3);
  assert.deepEqual(wrong, [], `一覧に載っているのに3群にならない: ${wrong.join(", ")}`);
});

test("シードの全レシピで、緑黄色野菜を使っていれば3群になる", () => {
  /* 7.1 の「緑黄色野菜を毎日1品以上」がこの判定に乗る。
     一覧に載っている食材を使っているのに3群が付かないレシピがあると、
     その日は野菜なしと数えられてしまう。 */
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

  const listed = new Set(GREEN_YELLOW.flatMap((row) => row.items));
  const missed: string[] = [];

  for (const recipe of parsed.recipes) {
    const names: string[] = recipe.ingredients.map(
      (ing: { name: string }) => ing.name,
    );
    const hasGreen = names.some((name) => listed.has(name));
    const groups = guessFoodGroups(names);
    if (hasGreen && !groups.includes(3)) missed.push(recipe.name);
    /* 逆も見る。緑黄色野菜を使っていないのに3群が付いていないか。 */
    if (!hasGreen && groups.includes(3)) {
      const why = names.filter((name) => groupOf(name) === 3);
      missed.push(`${recipe.name}（一覧に無い ${why.join("・")} で3群）`);
    }
  }

  assert.deepEqual(missed, []);
});

test("シードの全レシピで、主菜には必ず1群が付く", () => {
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
  const bad = parsed.recipes
    .filter((r: { dish_type: string }) => r.dish_type === "main")
    .filter((r: { ingredients: { name: string }[] }) =>
      !guessFoodGroups(r.ingredients.map((i) => i.name)).includes(1),
    )
    .map((r: { name: string }) => r.name);
  assert.deepEqual(bad, []);
});
