"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BackLink } from "@/app/(app)/back-link";
import { SHOP_CATEGORY_LABEL, formatQuantity } from "@/lib/labels";
import { weekStartOf } from "@/lib/plan-mapping";
import { SHOP_CATEGORY_ORDER } from "@/lib/shop-order";
import { createClient } from "@/lib/supabase/client";
import type { ShopCategory } from "@/lib/supabase/types";

/* 買い物リスト（仕様書 5.2-6 / 9章）。

   チェックは Supabase Realtime で2端末に即時反映する。
   自分の操作は待たずに画面へ出し、失敗したら戻す。 */

type Item = {
  id: string;
  name: string;
  total_qty: number | null;
  unit: string | null;
  shop_category: ShopCategory;
  checked: boolean;
  checked_by: string | null;
  sort_order: number;
};

export default function ShoppingPage() {
  const [weekStart] = useState(() => weekStartOf(new Date()));
  const [items, setItems] = useState<Item[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [planId, setPlanId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const userId = useRef<string>("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    userId.current = session?.user.id ?? "";

    const [{ data: plan }, { data: profiles }] = await Promise.all([
      supabase
        .from("meal_plans")
        .select("id, status")
        .eq("week_start", weekStart)
        .maybeSingle(),
      supabase.from("profiles").select("user_id, display_name"),
    ]);

    setNames(
      Object.fromEntries(
        (profiles ?? []).map((row) => [row.user_id, row.display_name]),
      ),
    );

    if (!plan) {
      setPlanId(null);
      setConfirmed(false);
      setItems([]);
      return;
    }

    setPlanId(plan.id);
    setConfirmed(plan.status === "confirmed");

    const { data: rows, error: loadError } = await supabase
      .from("shopping_items")
      .select("id, name, total_qty, unit, shop_category, checked, checked_by, sort_order")
      .eq("plan_id", plan.id)
      .order("sort_order");

    if (loadError) {
      setError("買い物リストを取得できませんでした。開き直してください。");
      return;
    }
    setItems(rows ?? []);
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  /* もう一方の端末での変更を受け取る（仕様書 9章）。 */
  useEffect(() => {
    if (!planId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`shopping:${planId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_items",
          filter: `plan_id=eq.${planId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [planId, load]);

  async function toggle(item: Item) {
    if (!items) return;
    const next = !item.checked;

    /* 押した感触を先に返す。 */
    setItems(
      items.map((row) =>
        row.id === item.id
          ? {
              ...row,
              checked: next,
              checked_by: next ? userId.current : null,
            }
          : row,
      ),
    );
    setError("");

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("shopping_items")
      .update({
        checked: next,
        checked_by: next ? userId.current : null,
        checked_at: next ? new Date().toISOString() : null,
      })
      .eq("id", item.id);

    if (saveError) {
      setItems(items); // 保存できていないので見た目も戻す
      setError("変更できませんでした。時間を置いて試してください。");
    }
  }

  const remaining = items?.filter((item) => !item.checked).length ?? 0;

  const groups = SHOP_CATEGORY_ORDER.map((category) => ({
    category,
    rows: (items ?? []).filter((item) => item.shop_category === category),
  })).filter((group) => group.rows.length > 0);

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-20">
      <BackLink href="/week/">週間献立</BackLink>

      <header className="pb-2">
        <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          SHOPPING · {weekStart.replaceAll("-", ".")}
        </p>
        <h1 className="mt-[7px] font-mincho text-[24px] font-bold tracking-[0.02em]">
          買い物リスト
        </h1>
      </header>

      {error ? (
        <p className="mt-3 text-[12.5px] text-meat" role="alert">
          {error}
        </p>
      ) : null}

      {items === null ? (
        <p className="mt-6 text-[12.5px] text-ink-3">読み込んでいます</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-[13px] leading-[1.95] text-ink-2">
          {confirmed
            ? "買うものはありません。すべて常備品でまかなえます。"
            : "買い物リストはまだありません。週間献立で「この内容で確定」を押すと作られます。"}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-ink-2" role="status">
            {remaining === 0 ? "全部買えました" : `未購入 ${remaining} 品`}
            {live ? (
              <span className="ml-2 font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
                同期中
              </span>
            ) : null}
          </p>

          {groups.map((group) => (
            <section className="mt-5" key={group.category}>
              <h2 className="border-b border-line pb-1.5 font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
                {SHOP_CATEGORY_LABEL[group.category]}
              </h2>
              <ul>
                {group.rows.map((item) => (
                  <li key={item.id}>
                    <button
                      aria-pressed={item.checked}
                      className="flex min-h-[48px] w-full items-center gap-3 border-b border-[#EFF1EC] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                      onClick={() => void toggle(item)}
                      type="button"
                    >
                      <span
                        aria-hidden
                        className={`flex h-[21px] w-[21px] flex-shrink-0 items-center justify-center rounded-[6px] border text-[12px] text-white ${
                          item.checked
                            ? "border-ai bg-ai"
                            : "border-line bg-card"
                        }`}
                      >
                        {item.checked ? "✓" : ""}
                      </span>
                      <span
                        className={`min-w-0 flex-1 text-[14px] ${
                          item.checked ? "text-ink-3 line-through" : "text-ink"
                        }`}
                      >
                        {item.name}
                      </span>
                      {item.checked && item.checked_by ? (
                        <span className="rounded-[5px] bg-[#EDF0EA] px-2 py-[3px] text-[10.5px] text-ink-2">
                          {names[item.checked_by] ?? "だれか"}
                        </span>
                      ) : null}
                      <span className="font-mono text-[11.5px] text-ink-3">
                        {formatQuantity(item.total_qty, item.unit)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
