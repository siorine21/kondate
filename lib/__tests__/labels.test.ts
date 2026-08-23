import assert from "node:assert/strict";
import test from "node:test";

import { formatNumber, formatQuantity, quantityStep } from "../labels.ts";

/* 分量の表示と増減の刻み。買い物のときに毎回見るところなので、
   端数の出方を決めておく。 */

test("4分の1きざみは分数で書く", () => {
  assert.equal(formatNumber(0.25), "1/4");
  assert.equal(formatNumber(0.5), "1/2");
  assert.equal(formatNumber(0.75), "3/4");
  assert.equal(formatNumber(1.25), "1と1/4");
  assert.equal(formatNumber(1.5), "1と1/2");
  assert.equal(formatNumber(2.75), "2と3/4");
});

test("整数と、4分の1でない端数はそのまま出す", () => {
  assert.equal(formatNumber(1), "1");
  assert.equal(formatNumber(250), "250");
  assert.equal(formatNumber(0.3), "0.3");
  assert.equal(formatNumber(1.2), "1.2");
});

test("単位の付け方", () => {
  assert.equal(formatQuantity(1.5, "個"), "1と1/2 個");
  assert.equal(formatQuantity(250, "g"), "250 g");
  /* 大さじ・小さじは数の前に置く。 */
  assert.equal(formatQuantity(1.5, "大さじ"), "大さじ1と1/2");
  assert.equal(formatQuantity(2, "小さじ"), "小さじ2");
  /* 分量が無いものは単位だけ、単位も無ければ適量。 */
  assert.equal(formatQuantity(null, null), "適量");
  assert.equal(formatQuantity(3, null), "3");
});

test("増減の刻み", () => {
  /* g と ml は 1 ずつでは細かすぎる。 */
  assert.equal(quantityStep(250, "g"), 10);
  assert.equal(quantityStep(400, "ml"), 10);
  /* 端数のあるものは4分の1。 */
  assert.equal(quantityStep(1.5, "個"), 0.25);
  assert.equal(quantityStep(0.5, "個"), 0.25);
  /* 1以下のものも4分の1。1丁 → 3/4丁 と刻めるようにする。 */
  assert.equal(quantityStep(1, "丁"), 0.25);
  /* それ以外は1。 */
  assert.equal(quantityStep(4, "尾"), 1);
  assert.equal(quantityStep(2, "切れ"), 1);
});

test("刻みを足し引きしても表示が壊れない", () => {
  let qty = 1.5;
  const unit = "個";
  const seen: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    qty = Math.round((qty - quantityStep(qty, unit)) * 100) / 100;
    seen.push(formatQuantity(qty, unit));
  }
  assert.deepEqual(seen, ["1と1/4 個", "1 個", "3/4 個", "1/2 個"]);
});
