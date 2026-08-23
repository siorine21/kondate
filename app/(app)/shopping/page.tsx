"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { BackLink } from "@/app/(app)/back-link";
import {
  SHOP_CATEGORY_LABEL,
  formatQuantity,
  quantityStep,
} from "@/lib/labels";
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

  /* 在庫があるときや、その日だけ多めに作るときに数を直せるようにする。
     刻みは単位と今の値から決める（g・ml は10、端数のあるものは4分の1）。 */
  async function adjust(item: Item, direction: 1 | -1) {
    if (!items || item.total_qty === null) return;

    const step = quantityStep(item.total_qty, item.unit);
    const next = Math.max(
      0,
      Math.round((item.total_qty + step * direction) * 100) / 100,
    );
    if (next === item.total_qty) return;

    const before = items;
    setItems(
      items.map((row) =>
        row.id === item.id ? { ...row, total_qty: next } : row,
      ),
    );
    setError("");

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("shopping_items")
      .update({ total_qty: next })
      .eq("id", item.id);

    if (saveError) {
      setItems(before); // 保存できていないので見た目も戻す
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
        <p className="mt-3 text-[12.5px] text-danger" role="alert">
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
                  <li
                    className="flex items-center gap-1 border-b border-line/60"
                    key={item.id}
                  >
                    <button
                      aria-pressed={item.checked}
                      className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
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
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[14px] ${
                            item.checked ? "text-ink-3 line-through" : "text-ink"
                          }`}
                        >
                          {item.name}
                        </span>
                        {item.checked && item.checked_by ? (
                          <span className="mt-[2px] block text-[10.5px] text-ink-3">
                            {names[item.checked_by] ?? "だれか"}が買いました
                          </span>
                        ) : null}
                      </span>
                    </button>

                    <div className="flex flex-shrink-0 items-center">
                      <StepButton
                        disabled={
                          item.total_qty === null || item.total_qty === 0
                        }
                        label={`${item.name} を減らす`}
                        onClick={() => void adjust(item, -1)}
                      >
                        −
                      </StepButton>
                      <span className="min-w-[58px] text-center font-mono text-[11.5px] text-ink-2">
                        {formatQuantity(item.total_qty, item.unit)}
                      </span>
                      <StepButton
                        disabled={item.total_qty === null}
                        label={`${item.name} を増やす`}
                        onClick={() => void adjust(item, 1)}
                      >
                        ＋
                      </StepButton>
                    </div>
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

/* 数量の増減。数の左右に置く。
   分量が「適量」の材料は増減できないので押せなくする。 */
function StepButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-[44px] w-[40px] items-center justify-center rounded-[8px] text-[17px] text-ink-2 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
