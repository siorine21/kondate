import type { ShoppingItem } from "./shopping.ts";

/* 買い物リストの差分更新（変更記録 3.25）。

   週に2回買い物に行くため、確定のたびに作り直すと、
   かごに入れた印も会計の記録も手で直した数量も消えてしまう。
   全消しして入れ直すのをやめ、いまの行と新しい集計を突き合わせる。

   純粋関数。Supabase を import しない（仕様書 2.3）。 */

export type ExistingRow = {
  id: string;
  name: string;
  unit: string | null;
  totalQty: number | null;
  /* かごに入れた。 */
  checked: boolean;
  /* レジを通した時刻（変更記録 3.16）。 */
  purchasedAt: string | null;
  /* 手で足した品（3.18）。 */
  isExtra: boolean;
  /* 前の週から引き継いだ品の、元の週の週頭（3.25）。 */
  carriedFrom: string | null;
  /* 数量を手で直した（3.25）。 */
  qtyEdited: boolean;
};

export type MergePlan = {
  /* 新しく足す品。数量は「まだ買っていない分」。 */
  inserts: ShoppingItem[];
  /* 数量だけ直す行。 */
  updates: { id: string; totalQty: number | null }[];
  /* 消す行。まだ手を付けていないものだけ。 */
  deletes: string[];
};

const keyOf = (name: string, unit: string | null) => `${name} ${unit ?? ""}`;

/* 献立に紐づかない行は、差分更新で触らない。
   手で足した品と、前の週から引き継いだ品。 */
const isManaged = (row: ExistingRow) => !row.isExtra && row.carriedFrom === null;

const isDone = (row: ExistingRow) => row.checked || row.purchasedAt !== null;

const round = (value: number) => Math.round(value * 100) / 100;

export function mergeShoppingList(input: {
  /* いま並んでいる行。 */
  existing: readonly ExistingRow[];
  /* 献立から組み直した、あるべき合計（lib/shopping.ts の出力）。 */
  target: readonly ShoppingItem[];
}): MergePlan {
  const { existing, target } = input;

  const plan: MergePlan = { inserts: [], updates: [], deletes: [] };

  const managed = existing.filter(isManaged);
  const byKey = new Map<string, ExistingRow[]>();
  for (const row of managed) {
    const key = keyOf(row.name, row.unit);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  const targetByKey = new Map<string, ShoppingItem>();
  for (const item of target) targetByKey.set(keyOf(item.name, item.unit), item);

  /* 1. いまある行を見る。 */
  for (const [key, rows] of byKey) {
    const done = rows.filter(isDone);
    const active = rows.filter((row) => !isDone(row));

    /* 未チェックの行が複数あることは本来無いが、あれば1本にまとめる。 */
    const keep = active[0] ?? null;
    for (const extra of active.slice(1)) plan.deletes.push(extra.id);

    const item = targetByKey.get(key);

    /* 献立から消えた品。まだ手を付けていなければ消す。 */
    if (!item) {
      if (keep) plan.deletes.push(keep.id);
      continue;
    }

    /* 数量を手で直した行は、数量を上書きしない。
       「今週は多めに買う」という意図を確定のたびに消さないため。 */
    if (keep?.qtyEdited) continue;

    const remaining = remainingQty(item.totalQty, done);

    if (remaining === "satisfied") {
      if (keep) plan.deletes.push(keep.id);
      continue;
    }

    if (keep) {
      if (keep.totalQty !== remaining) {
        plan.updates.push({ id: keep.id, totalQty: remaining });
      }
    } else {
      plan.inserts.push({ ...item, totalQty: remaining });
    }
  }

  /* 2. いまある行に無い品を足す。 */
  for (const [key, item] of targetByKey) {
    if (byKey.has(key)) continue;
    plan.inserts.push(item);
  }

  return plan;
}

/* まだ買う分。すでに買った分を引く。
   足りているときは "satisfied" を返す。 */
function remainingQty(
  total: number | null,
  done: readonly ExistingRow[],
): number | null | "satisfied" {
  /* 分量のない品（適量）は数えようがないので、
     一度でも買っていれば足りているものとする。 */
  if (total === null) return done.length > 0 ? "satisfied" : null;

  /* 買った側に分量が無い行が混ざっていたら、いくつ買ったか分からない。
     二重に買わせるより、足りている扱いにする。 */
  if (done.some((row) => row.totalQty === null)) {
    return done.length > 0 ? "satisfied" : total;
  }

  const bought = done.reduce((sum, row) => sum + (row.totalQty ?? 0), 0);
  const rest = round(total - bought);
  return rest > 0 ? rest : "satisfied";
}
