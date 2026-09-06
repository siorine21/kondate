import assert from "node:assert/strict";
import test from "node:test";

import { backTo, withOrigin } from "../nav.ts";

/* もどる先（仕様書 5.4 / 変更記録 3.37）。
   ここを間違えると、戻るを2回押さないと帰れない画面ができる。 */

test("遷移元があれば、そこへ返す", () => {
  assert.deepEqual(backTo("week", "today"), { href: "/week/", label: "週間献立" });
  assert.deepEqual(backTo("today", "recipes"), { href: "/", label: "今日の献立" });
});

test("遷移元が無ければ、既定の親へ返す", () => {
  assert.deepEqual(backTo(null, "today"), { href: "/", label: "今日の献立" });
  assert.deepEqual(backTo(null, "recipes"), { href: "/recipes/", label: "レシピ" });
});

test("知らない遷移元は既定の親へ倒す", () => {
  /* 手で URL を書き換えられても、行き先の無いリンクを出さない。 */
  assert.deepEqual(backTo("../../etc", "today"), { href: "/", label: "今日の献立" });
  assert.deepEqual(backTo("", "week"), { href: "/week/", label: "週間献立" });
  assert.deepEqual(backTo("constructor", "week"), { href: "/week/", label: "週間献立" });
});

test("遷移元を付ける。すでにクエリがあれば & でつなぐ", () => {
  assert.equal(withOrigin("/shopping/", "week"), "/shopping/?from=week");
  assert.equal(withOrigin("/recipe/?id=abc", "week"), "/recipe/?id=abc&from=week");
});
