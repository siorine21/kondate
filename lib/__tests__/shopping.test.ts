import assert from "node:assert/strict";
import test from "node:test";

import { buildShoppingList, type MasterEntry, type SourceRecipe } from "../shopping.ts";

/* 買い物リストの組み立て（仕様書 9章）。
   合算と名寄せを間違えると、買い物のときに必ず気づく類の不具合になる。 */

const recipes: SourceRecipe[] = [
  {
    id: "a",
    servings: 2,
    ingredients: [
      { name: "玉ねぎ", qty: 1, unit: "個", shopCategory: "produce" },
      { name: "鶏もも肉", qty: 250, unit: "g", shopCategory: "meat" },
      { name: "醤油", qty: 2, unit: "大さじ", shopCategory: "seasoning" },
      { name: "塩", qty: null, unit: null, shopCategory: "seasoning" },
    ],
  },
  {
    id: "b",
    servings: 2,
    ingredients: [
      { name: "たまねぎ", qty: 0.5, unit: "個", shopCategory: "produce" },
      { name: "にんにく", qty: 1, unit: "かけ", shopCategory: "produce" },
      { name: "にんにく", qty: 1, unit: "小さじ", shopCategory: "produce" },
    ],
  },
];

const master: MasterEntry[] = [
  { name: "玉ねぎ", aliases: ["たまねぎ"], isPantry: false },
  { name: "鶏もも肉", aliases: [], isPantry: false },
  { name: "にんにく", aliases: [], isPantry: false },
  { name: "醤油", aliases: [], isPantry: true },
  { name: "塩", aliases: [], isPantry: true },
];

function build(overrides: Partial<Parameters<typeof buildShoppingList>[0]> = {}) {
  return buildShoppingList({
    usedRecipeIds: ["a", "b"],
    recipes,
    master,
    householdServings: 2,
    includeSeasoning: false,
    ...overrides,
  });
}

test("同じ食材は名寄せして合算する", () => {
  const items = build();
  const onion = items.filter((item) => item.name === "玉ねぎ");
  assert.equal(onion.length, 1, "たまねぎと玉ねぎが別行になっている");
  assert.equal(onion[0].totalQty, 1.5);
  assert.equal(onion[0].unit, "個");
});

test("単位が違えば合算せず別の行にする", () => {
  const items = build();
  const garlic = items.filter((item) => item.name === "にんにく");
  assert.equal(garlic.length, 2);
  assert.deepEqual(
    garlic.map((item) => item.unit).sort(),
    ["かけ", "小さじ"],
  );
});

test("常備品は買い物リストに出さない", () => {
  const items = build();
  assert.ok(!items.some((item) => item.name === "醤油"));
  assert.ok(!items.some((item) => item.name === "塩"));
});

test("調味料を出す設定なら出る。ただし常備品は出ない", () => {
  const items = build({ includeSeasoning: true });
  /* 醤油と塩は is_pantry なので、設定に関わらず出ない。 */
  assert.ok(!items.some((item) => item.name === "醤油"));

  const withoutPantry = build({
    includeSeasoning: true,
    master: [{ name: "醤油", aliases: [], isPantry: false }],
  });
  const soy = withoutPantry.find((item) => item.name === "醤油");
  assert.equal(soy?.totalQty, 2);
});

test("世帯人数に合わせて倍率をかける", () => {
  const items = build({ householdServings: 3 });
  const chicken = items.find((item) => item.name === "鶏もも肉");
  assert.equal(chicken?.totalQty, 375); // 250 × 3/2
});

test("同じレシピが週に2回出たら2回ぶん買う", () => {
  const items = build({ usedRecipeIds: ["a", "a"] });
  const chicken = items.find((item) => item.name === "鶏もも肉");
  assert.equal(chicken?.totalQty, 500);
});

test("分量のない食材（適量）は数量を持たずに1行だけ出す", () => {
  const items = buildShoppingList({
    usedRecipeIds: ["a", "a"],
    recipes,
    master: [],
    householdServings: 2,
    includeSeasoning: true,
  });
  const salt = items.filter((item) => item.name === "塩");
  assert.equal(salt.length, 1);
  assert.equal(salt[0].totalQty, null);
});

test("売り場の順に並ぶ", () => {
  const items = build({ includeSeasoning: true, master: [] });
  const categories = items.map((item) => item.shopCategory);
  const produceEnds = categories.lastIndexOf("produce");
  const meatStarts = categories.indexOf("meat");
  const seasoningStarts = categories.indexOf("seasoning");

  assert.ok(produceEnds < meatStarts, "青果より精肉が先に出ている");
  assert.ok(meatStarts < seasoningStarts, "精肉より調味料が先に出ている");
  assert.deepEqual(
    items.map((item) => item.sortOrder),
    items.map((_, index) => index),
    "並び順の番号が飛んでいる",
  );
});

test("献立に無いレシピは無視する", () => {
  const items = build({ usedRecipeIds: ["a", "存在しない"] });
  assert.ok(items.length > 0);
  assert.ok(items.every((item) => item.name !== "にんにく"));
});
