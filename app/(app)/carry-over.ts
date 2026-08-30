import { addDays } from "@/lib/plan-mapping";
import type { createClient } from "@/lib/supabase/client";

/* 前の週で買えなかったものを、今週の買い物リストへ引き継ぐ（変更記録 3.25）。

   一度の買い物で全部買えるとは限らない。買えなかった品が前の週に
   取り残されると、次の週の一覧からは見えなくなってしまう。

   移すのであって、写すのではない。両方に並ぶと二重に買うため。
   引き継いだ行は献立に紐づかないので、差分更新では触らない。

   週間献立の確定と、買い物リストの画面の両方から呼ぶので、
   ここに1つだけ置く。同じ手続きを2箇所に書くと、片方だけ直す事故が起きる。 */

type Client = ReturnType<typeof createClient>;

export type CarryResult = {
  /* 引き継いだ件数。 */
  moved: number;
  /* 列がまだ無い（12_shopping_carryover.sql を実行していない）。 */
  needsColumn: boolean;
};

/* 引き継げる品を数える。移動はしない。 */
export async function countCarryable(
  supabase: Client,
  weekStart: string,
): Promise<CarryResult> {
  const previous = await previousPlanId(supabase, weekStart);
  if (!previous) return { moved: 0, needsColumn: false };

  const { data, error } = await supabase
    .from("shopping_items")
    .select("id")
    .eq("plan_id", previous)
    .eq("checked", false)
    .is("purchased_at", null);

  if (error) return { moved: 0, needsColumn: needsColumn(error.message) };
  return { moved: (data ?? []).length, needsColumn: false };
}

/* 前の週の買い残しを今週の plan へ移す。
   すでに引き継ぎ元が入っている行は上書きしない。
   いつから持ち越しているかが分かるようにするため（案C）。 */
export async function carryOver(
  supabase: Client,
  planId: string,
  weekStart: string,
): Promise<CarryResult> {
  const previous = await previousPlanId(supabase, weekStart);
  if (!previous) return { moved: 0, needsColumn: false };

  const { data: rows, error: loadError } = await supabase
    .from("shopping_items")
    .select("*")
    .eq("plan_id", previous)
    .eq("checked", false)
    .is("purchased_at", null);

  if (loadError) {
    return { moved: 0, needsColumn: needsColumn(loadError.message) };
  }
  if (!rows || rows.length === 0) return { moved: 0, needsColumn: false };

  const from = addDays(weekStart, -7);
  let moved = 0;

  for (const row of rows) {
    const { error: moveError } = await supabase
      .from("shopping_items")
      .update({
        plan_id: planId,
        /* 何週も持ち越しているものは、いちばん古い週を残す。 */
        carried_from: row.carried_from ?? from,
      })
      .eq("id", row.id);
    if (moveError) {
      return { moved, needsColumn: needsColumn(moveError.message) };
    }
    moved += 1;
  }

  return { moved, needsColumn: false };
}

async function previousPlanId(
  supabase: Client,
  weekStart: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("meal_plans")
    .select("id")
    .eq("week_start", addDays(weekStart, -7))
    .maybeSingle();
  return data?.id ?? null;
}

const needsColumn = (message: string) =>
  message.includes("carried_from") || message.includes("qty_edited");
