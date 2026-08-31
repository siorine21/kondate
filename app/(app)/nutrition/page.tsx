"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BackLink } from "@/app/(app)/back-link";
import { CATEGORY_LABEL, FOOD_GROUP_LABEL } from "@/lib/labels";
import { evaluateWeek, type Nutrition } from "@/lib/nutrition";
import { addDays, formatDay, itemsToPlan, toPlannerRecipe, weekStartOf } from "@/lib/plan-mapping";
import type { PlannerRecipe } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import type { RecipeCategory } from "@/lib/supabase/types";

/* 栄養サマリ（仕様書 5.2-5 / 10章）。

   kcal・PFC は計算しない（1.4）。六つの基礎食品群のカバレッジと、
   週次目標の達成状況だけを見る。計算は lib/nutrition.ts の純粋関数が行い、
   この画面は入出力だけを見る。

   仕様書はレーダーチャートを指定していたが、横棒に替えた（変更記録 3.26）。 */

const GROUPS = [1, 2, 3, 4, 5, 6];

/* 和洋中の帯。同じ色相の3段で、順番は世帯の比率設定と同じ 和→洋→中。
   色だけで見分けさせず、どの帯にも品数を直に書く。 */
const MIX_STEP: Record<RecipeCategory, string> = {
  washoku: "bg-mix-1",
  yoshoku: "bg-mix-2",
  chuka: "bg-mix-3",
  other: "bg-mix-4",
};
const MIX_ORDER: readonly RecipeCategory[] = [
  "washoku",
  "yoshoku",
  "chuka",
  "other",
];

export default function NutritionPage() {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [thisWeek] = useState(() => weekStartOf(new Date()));
  const [nutrition, setNutrition] = useState<Nutrition | null>(null);
  const [hasPlan, setHasPlan] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const supabase = createClient();

    const [{ data: plan }, { data: recipeRows }, { data: ingredientRows }] =
      await Promise.all([
        supabase
          .from("meal_plans")
          .select("id")
          .eq("week_start", weekStart)
          .maybeSingle(),
        supabase.from("recipes").select("*"),
        supabase.from("recipe_ingredients").select("recipe_id, name"),
      ]);

    if (!plan) {
      setHasPlan(false);
      setNutrition(null);
      setLoading(false);
      return;
    }

    const { data: items, error: itemError } = await supabase
      .from("meal_plan_items")
      .select("date, slot, recipe_id, entry_type, locked")
      .eq("plan_id", plan.id)
      .order("date");

    if (itemError) {
      setError("献立を読み込めませんでした。開き直してください。");
      setLoading(false);
      return;
    }

    const names = new Map<string, string[]>();
    for (const row of ingredientRows ?? []) {
      names.set(row.recipe_id, [...(names.get(row.recipe_id) ?? []), row.name]);
    }
    const recipes: PlannerRecipe[] = (recipeRows ?? []).map((recipe) =>
      toPlannerRecipe(recipe, names.get(recipe.id) ?? []),
    );
    const byId = (id: string | null) =>
      recipes.find((recipe) => recipe.id === id) ?? null;

    const built = itemsToPlan(weekStart, items ?? []);
    setHasPlan(true);
    setNutrition(evaluateWeek({ days: built.days, byId }));
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const unmet = nutrition?.goals.filter((goal) => !goal.met) ?? [];
  const mixTotal =
    nutrition?.categoryMix.reduce((sum, row) => sum + row.count, 0) ?? 0;
  const mix = MIX_ORDER.map((category) => ({
    category,
    count: nutrition?.categoryMix.find((m) => m.category === category)?.count ?? 0,
  })).filter((row) => row.count > 0);

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-16">
      <div className="pt-2">
        <BackLink href="/week/">週間献立</BackLink>
      </div>

      <p className="mt-3 font-mono text-[9.5px] tracking-[0.24em] text-ink-3">
        NUTRITION · {formatDay(weekStart).day} – {formatDay(addDays(weekStart, 6)).day}
      </p>
      <h1 className="mt-1 font-mincho text-[26px] font-bold tracking-[0.06em] text-ink">
        栄養サマリ
      </h1>

      <div className="mt-3 flex items-center gap-2">
        <WeekButton label="前の週" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          ‹
        </WeekButton>
        <p className="flex-1 text-center text-[12px] text-ink-2">
          {weekStart === thisWeek ? "今週" : formatDay(weekStart).day + " の週"}
        </p>
        <WeekButton label="次の週" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          ›
        </WeekButton>
      </div>

      {error ? (
        <p className="mt-4 text-[12.5px] leading-[1.8] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-8 text-[12.5px] text-ink-3">読み込んでいます</p>
      ) : !hasPlan || !nutrition ? (
        <div className="mt-10 text-center">
          <p className="text-[12.5px] leading-[1.9] text-ink-2">
            この週の献立はまだありません。
            <br />
            献立を作ると、栄養の偏りが見えるようになります。
          </p>
          <Link
            className="mt-6 inline-flex min-h-[48px] w-full max-w-[280px] items-center justify-center rounded-[11px] bg-ai text-[13.5px] font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            href="/week/"
          >
            週間献立をひらく
          </Link>
        </div>
      ) : nutrition.cookDays === 0 ? (
        <p className="mt-8 text-[12.5px] leading-[1.9] text-ink-2">
          この週は自炊する日がありません。判定するものがありません。
        </p>
      ) : (
        <>
          {/* 1. 週次目標。いちばん行動につながるので先に置く。 */}
          <section className="mt-6">
            <h2 className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
              週の目標
            </h2>
            <ul className="mt-2 overflow-hidden rounded-card border border-line bg-card">
              {nutrition.goals.map((goal) => (
                <li
                  className="flex items-center gap-2.5 border-b border-line/60 px-3.5 py-3 last:border-0"
                  key={goal.key}
                >
                  <StatusMark met={goal.met} />
                  <span className="min-w-0 flex-1 text-[13px] text-ink">
                    {goal.label}
                  </span>
                  <span
                    className={`flex-shrink-0 font-mono text-[11px] ${
                      goal.met ? "text-ok" : "text-danger"
                    }`}
                  >
                    {goal.key === "fry"
                      ? goal.met
                        ? "なし"
                        : `${goal.actual} 回`
                      : `${goal.actual} / ${goal.target}`}
                  </span>
                </li>
              ))}
            </ul>

            {unmet.length > 0 ? (
              <p className="mt-2 text-[11.5px] leading-[1.8] text-ink-2">
                {`届かなかった ${unmet.map((goal) => goal.hint).join("・")} は、次に週を組むときに優先して選ばれます。`}
              </p>
            ) : (
              <p className="mt-2 text-[11.5px] leading-[1.8] text-ok">
                今週の目標はすべて満たしています。
              </p>
            )}
          </section>

          {/* 2. 食品群のカバレッジ。 */}
          <section className="mt-7">
            <h2 className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
              食品群 · 自炊 {nutrition.cookDays} 日のうち
            </h2>
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {GROUPS.map((group) => (
                <GroupBar
                  days={nutrition.days[group] ?? 0}
                  group={group}
                  key={group}
                  total={nutrition.cookDays}
                />
              ))}
            </ul>
          </section>

          {/* 3. 和洋中の配分。 */}
          <section className="mt-7">
            <h2 className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
              主菜の和洋中
            </h2>
            {mixTotal === 0 ? (
              <p className="mt-2 text-[12.5px] text-ink-2">主菜がまだ入っていません。</p>
            ) : (
              <>
                <div
                  aria-hidden
                  className="mt-2.5 flex h-[14px] w-full gap-[2px] overflow-hidden rounded-[7px]"
                >
                  {mix.map((row) => (
                    <span
                      className={`h-full ${MIX_STEP[row.category]}`}
                      key={row.category}
                      style={{ width: `${(row.count / mixTotal) * 100}%` }}
                    />
                  ))}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {mix.map((row) => (
                    <li
                      className="flex items-center gap-1.5 text-[12px] text-ink-2"
                      key={row.category}
                    >
                      <span
                        aria-hidden
                        className={`h-[10px] w-[10px] flex-shrink-0 rounded-[2px] ${MIX_STEP[row.category]}`}
                      />
                      {CATEGORY_LABEL[row.category]}
                      <span className="font-mono text-[11px] text-ink-3">
                        {row.count} 日
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}

/* 群ごとの帯。1色の濃さではなく長さで量を出す。
   色で群を見分けさせないので、名前と日数を必ず添える。 */
function GroupBar({
  group,
  days,
  total,
}: {
  group: number;
  days: number;
  total: number;
}) {
  const ratio = total > 0 ? days / total : 0;
  const full = days >= total && total > 0;

  return (
    <li>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
          {FOOD_GROUP_LABEL[group]}
        </span>
        <span
          className={`flex-shrink-0 font-mono text-[11px] ${
            full ? "text-ok" : "text-ink-3"
          }`}
        >
          {days} / {total} 日
        </span>
      </div>
      <div
        aria-hidden
        className="mt-1 h-[8px] w-full overflow-hidden rounded-[4px] bg-chip"
      >
        <span
          className="block h-full rounded-[4px] bg-ai"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </li>
  );
}

/* 達成・未達の印。色だけに頼らず、形も変える。 */
function StatusMark({ met }: { met: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
        met ? "bg-ok" : "bg-danger"
      }`}
    >
      {met ? "✓" : "!"}
    </span>
  );
}

function WeekButton({
  children,
  label,
  onClick,
}: {
  children: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-[40px] w-[44px] items-center justify-center rounded-[9px] border border-line bg-card text-[15px] text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
