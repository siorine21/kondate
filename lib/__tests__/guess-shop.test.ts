import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { guessShopCategory, normalizeUnit } from "../guess-shop.ts";
import type { MasterEntry } from "../guess-shop.ts";

/* 買い物メモの売り場の見当。外れても手で直せるが、
   よく買うものが「その他」に落ちないことを確かめておく。 */

const master: readonly MasterEntry[] = [
  { name: "鶏もも肉", shop_category: "meat" },
  { name: "生鮭", shop_category: "seafood" },
  { name: "木綿豆腐", shop_category: "tofu" },
  { name: "玉ねぎ", shop_category: "produce" },
];

test("食材マスタに載っていればその売り場", () => {
  assert.equal(guessShopCategory("鶏もも肉", master), "meat");
  assert.equal(guessShopCategory("生鮭", master), "seafood");
  assert.equal(guessShopCategory("木綿豆腐", master), "tofu");
});

test("食材マスタは部分一致でも拾う", () => {
  /* 「鶏もも肉 300g」と書いても精肉。 */
  assert.equal(guessShopCategory("鶏もも肉 300g", master), "meat");
  /* 逆に短く「豆腐」と書いても、マスタの木綿豆腐から拾う。 */
  assert.equal(guessShopCategory("豆腐", master), "tofu");
});

test("マスタに無くても手がかりから当てる", () => {
  /* 実際に起きた例。牛肉・鶏肉・豚肉が全部「その他」に入っていた。 */
  assert.equal(guessShopCategory("牛肉"), "meat");
  assert.equal(guessShopCategory("鶏肉"), "meat");
  assert.equal(guessShopCategory("豚肉"), "meat");
  assert.equal(guessShopCategory("合いびき肉"), "meat");
  assert.equal(guessShopCategory("ベーコン"), "meat");
});

test("紛らわしい名前を取り違えない", () => {
  /* 「牛乳」が「牛」に引きずられて精肉にならないこと。 */
  assert.equal(guessShopCategory("牛乳"), "dairy_egg");
  /* 「ごま油」は乾物のごまではなく調味料。 */
  assert.equal(guessShopCategory("ごま油"), "seasoning");
  /* 「油揚げ」は豆腐・練物。揚げ物でも調味料でもない。 */
  assert.equal(guessShopCategory("油揚げ"), "tofu");
  /* 「切り干し大根」は乾物。青果の大根ではない。 */
  assert.equal(guessShopCategory("切り干し大根"), "dry");
  /* 「豆乳」は乳・卵。豆腐ではない。 */
  assert.equal(guessShopCategory("豆乳"), "dairy_egg");
});

test("見当がつかなければその他のまま", () => {
  assert.equal(guessShopCategory("洗剤"), "other");
  assert.equal(guessShopCategory("ティッシュ"), "other");
  assert.equal(guessShopCategory(""), "other");
  assert.equal(guessShopCategory("   "), "other");
});

test("マスタは手がかりより優先する", () => {
  /* この家では「大豆」を乾物として置いている、という場合。 */
  const own: readonly MasterEntry[] = [{ name: "卵", shop_category: "other" }];
  assert.equal(guessShopCategory("卵", own), "other");
  /* マスタを渡さなければ手がかりどおり乳・卵。 */
  assert.equal(guessShopCategory("卵"), "dairy_egg");
});

test("単位の書き方を揃える", () => {
  /* 実際に起きた例。「1 G」と「1 g」が別の書き方で並んでいた。 */
  assert.equal(normalizeUnit("G"), "g");
  assert.equal(normalizeUnit("g"), "g");
  assert.equal(normalizeUnit("ｇ"), "g");
  assert.equal(normalizeUnit(" ML "), "ml");
  assert.equal(normalizeUnit("L"), "L");
  assert.equal(normalizeUnit("l"), "L");
  assert.equal(normalizeUnit("KG"), "kg");
});

test("日本語の単位はそのまま残す", () => {
  assert.equal(normalizeUnit("個"), "個");
  assert.equal(normalizeUnit("本"), "本");
  assert.equal(normalizeUnit("大さじ"), "大さじ");
  assert.equal(normalizeUnit(""), "");
  assert.equal(normalizeUnit("  "), "");
});

test("シードの全材料で、売り場がシードの指定と揃う", () => {
  /* レシピの材料は買い物リストの売り場順にそのまま効く（仕様書 9章）。
     手で入れた 62 件を正解として突き合わせる。 */
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

  const truth = new Map<string, string>();
  for (const recipe of parsed.recipes) {
    for (const ing of recipe.ingredients as { name: string; shop_category: string }[]) {
      truth.set(ing.name, ing.shop_category);
    }
  }

  const wrong: string[] = [];
  for (const [name, want] of truth) {
    const got = guessShopCategory(name);
    /* カットトマト缶だけは意図して変えている。シードは「その他」だが、
       缶詰は乾物の棚にあるので、そちらのほうが店内で探しやすい。 */
    if (name === "カットトマト缶") {
      assert.equal(got, "dry");
      continue;
    }
    if (got !== want) wrong.push(`${name}: ${want} のはずが ${got}`);
  }
  assert.deepEqual(wrong, []);
});

test("調味料に寄せてよいものと、そうでないもの", () => {
  /* 粉類は調味料に置く。買い物リストで「調味料を出さない」設定に
     一緒に従わせるため。家にあるものを毎週出しても仕方がない。 */
  assert.equal(guessShopCategory("小麦粉"), "seasoning");
  assert.equal(guessShopCategory("片栗粉"), "seasoning");
  assert.equal(guessShopCategory("揚げ油"), "seasoning");
  /* 生の葉物は青果。乾燥だけとは限らない。 */
  assert.equal(guessShopCategory("バジル"), "produce");
  assert.equal(guessShopCategory("しそ"), "produce");
  /* だし汁は自分で取るもので買わない。だしの素は買う。 */
  assert.equal(guessShopCategory("だし汁"), "other");
  assert.equal(guessShopCategory("だしの素"), "seasoning");
});
