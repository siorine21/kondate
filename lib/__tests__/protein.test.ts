import assert from "node:assert/strict";
import test from "node:test";

import { proteinOf, proteinSourcesOf } from "../protein.ts";

/* 含まれるたんぱく源（変更記録 3.34）。

   main_protein は主役を1つ選ぶだけ。実際には2つ以上使う料理が多いので、
   達成の判定はこちらで数える。 */

test("材料ひとつのたんぱく源", () => {
  assert.equal(proteinOf("鶏もも肉"), "meat");
  assert.equal(proteinOf("豚こま切れ肉"), "meat");
  assert.equal(proteinOf("合いびき肉"), "meat");
  assert.equal(proteinOf("ベーコン"), "meat");
  assert.equal(proteinOf("生鮭"), "fish");
  assert.equal(proteinOf("あじ"), "fish");
  assert.equal(proteinOf("えび"), "fish");
  assert.equal(proteinOf("ちくわ"), "fish");
  assert.equal(proteinOf("卵"), "egg");
  assert.equal(proteinOf("木綿豆腐"), "soy");
  assert.equal(proteinOf("厚揚げ"), "soy");
  assert.equal(proteinOf("納豆"), "soy");
});

test("調味料をたんぱく源として数えない", () => {
  /* ここが要。判断は food-groups.ts に任せているので、
     あちらを直せばこちらも直る。 */
  assert.equal(proteinOf("鶏がらスープの素"), null, "鶏を含むが調味料");
  assert.equal(proteinOf("醤油"), null, "大豆から作るが調味料");
  assert.equal(proteinOf("味噌"), null, "同上");
  assert.equal(proteinOf("かつお節"), null, "2群なので魚として数えない");
  assert.equal(proteinOf("だしの素"), null);
  assert.equal(proteinOf("牛乳"), null, "2群");
  assert.equal(proteinOf("玉ねぎ"), null);
  assert.equal(proteinOf(""), null);
});

test("レシピに含まれるものを、重複なく集める", () => {
  /* 実在する例。主役は大豆だが、豚肉も入っている。 */
  assert.deepEqual(
    proteinSourcesOf(["厚揚げ", "豚こま切れ肉", "キャベツ", "味噌"]).sort(),
    ["meat", "soy"],
  );
  /* 主役は卵だが、鶏ひき肉も入っている。 */
  assert.deepEqual(
    proteinSourcesOf(["卵", "鶏ひき肉", "ごはん", "醤油"]).sort(),
    ["egg", "meat"],
  );
  /* 同じものが2回出ても1つにまとまる。 */
  assert.deepEqual(proteinSourcesOf(["鶏もも肉", "鶏むね肉"]), ["meat"]);
  /* たんぱく源が無ければ空。 */
  assert.deepEqual(proteinSourcesOf(["きゅうり", "酢", "砂糖"]), []);
  assert.deepEqual(proteinSourcesOf([]), []);
});

test("スープの素だけでは肉にならない", () => {
  /* シードの「卵とトマトの中華スープ」。鶏がらスープの素が入っているが、
     肉として数えてはいけない。 */
  const found = proteinSourcesOf([
    "トマト", "長ねぎ", "卵", "水", "鶏がらスープの素", "ごま油", "塩",
  ]);
  assert.deepEqual(found, ["egg"]);
});
