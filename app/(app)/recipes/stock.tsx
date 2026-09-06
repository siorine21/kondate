"use client";

import { useState } from "react";

import { assessLibrary, type Level, type Stock } from "@/lib/library";
import { MEAT_LABEL } from "@/lib/meat";
import type { PlannerRecipe, PlannerSettings } from "@/lib/planner";

/* レシピ帳の在庫（変更記録 3.33）。

   「次にどの主菜を登録すればよいか」に答える。栄養サマリ（10章）は
   今週の食卓を見るもので、こちらはレシピ帳そのものを見る。

   目標は献立生成の数字から出しているので、設定の「同じ主菜を空ける日数」を
   延ばせば目標も伸びる。ここで独自の数字は決めていない。 */

const MARK: Record<Level, string> = { ok: "✓", low: "△", short: "!" };

const TONE: Record<Level, string> = {
  ok: "border-ok/40 text-ok",
  low: "border-yuzu/50 text-yuzu",
  short: "border-danger/50 text-danger",
};

export function StockSection({
  recipes,
  settings,
}: {
  recipes: readonly PlannerRecipe[];
  settings: PlannerSettings;
}) {
  const [open, setOpen] = useState(false);
  const library = assessLibrary({ recipes, settings });

  if (library.totalMains === 0) return null;

  const missing = [...library.protein, library.weekday].filter(
    (row) => row.level !== "ok",
  );

  return (
    <section className="mt-4 rounded-card border border-line bg-card p-4">
      <button
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          主菜の在庫 · {library.totalMains} / {library.wantMains} 件
        </span>
        <span
          aria-hidden
          className={`ml-auto text-[13px] text-ink-3 transition-transform ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>

      <p className="mt-2 text-[12px] leading-[1.8] text-ink-2">
        {missing.length === 0
          ? `同じ主菜を${settings.repeatGapDays}日空けるのに足りています。`
          : `${missing.map((row) => row.label).join("・")}が足りません。`}
      </p>

      {open ? (
        <>
          <p className="mt-3 text-[11px] leading-[1.7] text-ink-3">
            {`同じ主菜を${settings.repeatGapDays}日（${library.weeks}週）空けるのに要る数です。設定を変えると目標も変わります。`}
          </p>

          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {library.protein.map((row) => (
              <StockChip key={row.key} stock={row} />
            ))}
            <StockChip stock={library.weekday} />
          </ul>

          {library.meatMix.length > 0 ? (
            <div className="mt-3.5 border-t border-line/60 pt-3">
              <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
                肉の主菜の内訳
              </p>
              <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1">
                {library.meatMix.map((row) => (
                  <li className="text-[12.5px] text-ink-2" key={row.kind}>
                    {MEAT_LABEL[row.kind]}
                    <span className="ml-1 font-mono text-[11px] text-ink-3">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] leading-[1.7] text-ink-3">
                目標はありません。同じ肉が2日続かないようには組んでいるので、
                偏っていると続きやすくなります。
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/* 状態は色だけに頼らず、記号と数も添える。 */
function StockChip({ stock }: { stock: Stock }) {
  return (
    <li
      className={`flex items-center gap-1.5 rounded-[20px] border bg-card px-2.5 py-1 text-[12px] ${TONE[stock.level]}`}
    >
      <span aria-hidden className="font-bold">
        {MARK[stock.level]}
      </span>
      <span className="text-ink">{stock.label}</span>
      <span className="font-mono text-[11px]">
        {stock.have} / {stock.want}
      </span>
    </li>
  );
}
