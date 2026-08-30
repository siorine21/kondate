import assert from "node:assert/strict";
import test from "node:test";

import { mergeShoppingList } from "../shopping-merge.ts";
import type { ExistingRow } from "../shopping-merge.ts";
import type { ShoppingItem } from "../shopping.ts";

/* 買い物リストの差分更新（変更記録 3.25）。

   週に2回買い物へ行くので、確定のたびに作り直すと、かごに入れた印も
   会計の記録も消えてしまう。ここが守るのはその2つ。 */

let seq = 0;
const row = (over: Partial<ExistingRow> = {}): ExistingRow => ({
  id: `x${(seq += 1)}`,
  name: "玉ねぎ",
  unit: "個",
  totalQty: 2,
  checked: false,
  purchasedAt: null,
  isExtra: false,
  carriedFrom: null,
  qtyEdited: false,
  ...over,
});

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({
  name: "玉ねぎ",
  totalQty: 2,
  unit: "個",
  shopCategory: "produce",
  sortOrder: 0,
  ...over,
});

test("何も変わっていなければ、何も動かさない", () => {
  const plan = mergeShoppingList({ existing: [row()], target: [item()] });
  assert.deepEqual(plan, { inserts: [], updates: [], deletes: [] });
});

test("献立で増えた分だけ数量を直す", () => {
  const existing = [row({ id: "a", totalQty: 2 })];
  const plan = mergeShoppingList({ existing, target: [item({ totalQty: 3 })] });
  assert.deepEqual(plan.updates, [{ id: "a", totalQty: 3 }]);
  assert.deepEqual(plan.inserts, []);
  assert.deepEqual(plan.deletes, []);
});

test("かごに入れた行は触らず、増えた分だけ新しく並ぶ", () => {
  /* 日曜に2個買ってかごに入れた。水曜の献立で合計3個必要になった。 */
  const existing = [row({ id: "a", totalQty: 2, checked: true })];
  const plan = mergeShoppingList({ existing, target: [item({ totalQty: 3 })] });
  assert.deepEqual(plan.deletes, [], "買った行を消してはいけない");
  assert.deepEqual(plan.updates, [], "買った行の数量を変えてはいけない");
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].totalQty, 1, "まだ買う分は1個");
});

test("会計済みの行も同じ扱い", () => {
  const existing = [
    row({ id: "a", totalQty: 2, checked: true, purchasedAt: "2026-08-30T10:00:00Z" }),
  ];
  const plan = mergeShoppingList({ existing, target: [item({ totalQty: 5 })] });
  assert.deepEqual(plan.deletes, []);
  assert.equal(plan.inserts[0].totalQty, 3);
});

test("もう足りていれば、まだ買う行は消える", () => {
  /* 3個買ってある。献立を減らして合計2個になった。 */
  const existing = [
    row({ id: "done", totalQty: 3, checked: true }),
    row({ id: "todo", totalQty: 1 }),
  ];
  const plan = mergeShoppingList({ existing, target: [item({ totalQty: 2 })] });
  assert.deepEqual(plan.deletes, ["todo"]);
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.inserts, []);
});

test("献立から消えた品は、手を付けていなければ消す", () => {
  const existing = [row({ id: "a" })];
  const plan = mergeShoppingList({ existing, target: [] });
  assert.deepEqual(plan.deletes, ["a"]);
});

test("献立から消えても、買ってあれば残す", () => {
  const existing = [row({ id: "a", checked: true })];
  const plan = mergeShoppingList({ existing, target: [] });
  assert.deepEqual(plan, { inserts: [], updates: [], deletes: [] });
});

test("手で足した品は触らない", () => {
  const existing = [row({ id: "a", name: "牛乳", unit: "本", isExtra: true })];
  const plan = mergeShoppingList({ existing, target: [] });
  assert.deepEqual(plan, { inserts: [], updates: [], deletes: [] });
});

test("前の週から引き継いだ品は触らない", () => {
  const existing = [row({ id: "a", carriedFrom: "2026-08-23" })];
  /* 献立に同じ品があっても、引き継ぎ行とは別に数える（案1：分けたまま）。 */
  const plan = mergeShoppingList({ existing, target: [item({ totalQty: 2 })] });
  assert.deepEqual(plan.deletes, []);
  assert.deepEqual(plan.updates, []);
  assert.equal(plan.inserts.length, 1, "今週のぶんは別の行として並ぶ");
  assert.equal(plan.inserts[0].totalQty, 2);
});

test("数量を手で直した行は、数量を上書きしない", () => {
  const existing = [row({ id: "a", totalQty: 5, qtyEdited: true })];
  const plan = mergeShoppingList({ existing, target: [item({ totalQty: 2 })] });
  assert.deepEqual(plan.updates, []);
  assert.deepEqual(plan.deletes, []);
});

test("手で直した行でも、献立から消えれば消す", () => {
  const existing = [row({ id: "a", totalQty: 5, qtyEdited: true })];
  const plan = mergeShoppingList({ existing, target: [] });
  assert.deepEqual(plan.deletes, ["a"]);
});

test("単位が違えば別の品として扱う", () => {
  const existing = [row({ id: "g", unit: "g", totalQty: 300 })];
  const plan = mergeShoppingList({
    existing,
    target: [item({ unit: "個", totalQty: 2 })],
  });
  assert.deepEqual(plan.deletes, ["g"]);
  assert.equal(plan.inserts.length, 1);
  assert.equal(plan.inserts[0].unit, "個");
});

test("分量のない品（適量）", () => {
  /* まだ買っていなければ1行だけ並ぶ。 */
  const first = mergeShoppingList({
    existing: [],
    target: [item({ name: "こしょう", totalQty: null, unit: null })],
  });
  assert.equal(first.inserts.length, 1);
  assert.equal(first.inserts[0].totalQty, null);

  /* 一度買っていれば、二度並べない。 */
  const after = mergeShoppingList({
    existing: [
      row({ id: "d", name: "こしょう", unit: null, totalQty: null, checked: true }),
    ],
    target: [item({ name: "こしょう", totalQty: null, unit: null })],
  });
  assert.deepEqual(after, { inserts: [], updates: [], deletes: [] });
});

test("買った側に分量が無いときは、二重に買わせない", () => {
  const existing = [row({ id: "d", totalQty: null, checked: true })];
  const plan = mergeShoppingList({ existing, target: [item({ totalQty: 3 })] });
  assert.deepEqual(plan.inserts, [], "いくつ買ったか分からないので足さない");
  assert.deepEqual(plan.deletes, []);
});

test("端数が丸められる", () => {
  const existing = [row({ id: "d", totalQty: 1.5, checked: true })];
  const plan = mergeShoppingList({ existing, target: [item({ totalQty: 2.25 })] });
  assert.equal(plan.inserts[0].totalQty, 0.75);
});

test("日曜から水曜までの一連の流れ", () => {
  /* 日曜：2品ぶんの材料で確定 */
  const sunday = mergeShoppingList({
    existing: [],
    target: [
      item({ name: "玉ねぎ", totalQty: 2, unit: "個" }),
      item({ name: "鶏もも肉", totalQty: 300, unit: "g", shopCategory: "meat" }),
    ],
  });
  assert.equal(sunday.inserts.length, 2);

  /* 玉ねぎは買えた。鶏肉は売り切れで買えなかった。 */
  const afterShopping: ExistingRow[] = [
    row({ id: "onion", name: "玉ねぎ", unit: "個", totalQty: 2, checked: true,
      purchasedAt: "2026-08-30T10:00:00Z" }),
    row({ id: "chicken", name: "鶏もも肉", unit: "g", totalQty: 300 }),
  ];

  /* 水曜：残りの日を決めて確定。玉ねぎは合計3個、鶏肉は変わらず、豆腐が増えた。 */
  const wednesday = mergeShoppingList({
    existing: afterShopping,
    target: [
      item({ name: "玉ねぎ", totalQty: 3, unit: "個" }),
      item({ name: "鶏もも肉", totalQty: 300, unit: "g", shopCategory: "meat" }),
      item({ name: "木綿豆腐", totalQty: 1, unit: "丁", shopCategory: "tofu" }),
    ],
  });

  assert.deepEqual(wednesday.deletes, [], "買った玉ねぎも、買えなかった鶏肉も残る");
  assert.deepEqual(wednesday.updates, [], "鶏肉の数量は変わらない");
  const added = wednesday.inserts
    .map((i) => `${i.name} ${i.totalQty}`)
    .sort((a, b) => a.localeCompare(b, "ja"));
  assert.deepEqual(added, ["玉ねぎ 1", "木綿豆腐 1"], "足りない分だけが並ぶ");
});
