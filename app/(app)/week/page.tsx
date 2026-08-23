"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BackLink } from "@/app/(app)/back-link";
import {
  addDays,
  formatDay,
  toPlannerRecipe,
  toPlannerSettings,
  weekStartOf,
} from "@/lib/plan-mapping";
import {
  generateWeek,
  rerollDay,
  type GeneratedPlan,
  type MainHistory,
  type PlanDay,
  type PlannerRecipe,
  type PlannerSettings,
} from "@/lib/planner";
import {
  buildShoppingList,
  type MasterEntry,
  type SourceRecipe,
} from "@/lib/shopping";
import { createClient } from "@/lib/supabase/client";
import type { DishType, EntryType } from "@/lib/supabase/types";

import { WeekView } from "./week-view";
import { Violations } from "./violations";

/* 週間献立（仕様書 5.2-3）。

   組むのは lib/planner の純粋関数。この画面は入出力だけを見る。
   AI は使わない（2.2-5）。 */

type Loaded = {
  householdId: string;
  settings: PlannerSettings;
  recipes: PlannerRecipe[];
  ratings: Record<string, number>;
  history: MainHistory[];
  plan: GeneratedPlan | null;
  confirmed: boolean;
  /* 買い物リストの組み立てに使う（仕様書 9章）。 */
  sourceRecipes: SourceRecipe[];
  master: MasterEntry[];
  householdServings: number;
  includeSeasoning: boolean;
};

export default function WeekPage() {
  const [thisWeek] = useState(() => weekStartOf(new Date()));
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();

    const [
      { data: household, error: householdError },
      { data: recipeRows },
      { data: ingredientRows },
      { data: ratingRows },
      { data: masterRows },
      { data: planRow },
    ] = await Promise.all([
      supabase.from("households").select("*").maybeSingle(),
      supabase.from("recipes").select("*").eq("status", "active"),
      supabase
        .from("recipe_ingredients")
        .select("recipe_id, name, qty, unit, shop_category"),
      supabase.from("recipe_ratings").select("recipe_id, score"),
      supabase.from("ingredient_master").select("name, aliases, is_pantry"),
      supabase
        .from("meal_plans")
        .select("id, status")
        .eq("week_start", weekStart)
        .maybeSingle(),
    ]);

    if (householdError || !household) {
      setError("設定を読み込めませんでした。開き直してください。");
      return;
    }

    const names = new Map<string, string[]>();
    for (const row of ingredientRows ?? []) {
      names.set(row.recipe_id, [...(names.get(row.recipe_id) ?? []), row.name]);
    }
    const recipes = (recipeRows ?? []).map((recipe) =>
      toPlannerRecipe(recipe, names.get(recipe.id) ?? []),
    );

    const sourceRecipes: SourceRecipe[] = (recipeRows ?? []).map((recipe) => ({
      id: recipe.id,
      servings: recipe.servings,
      ingredients: (ingredientRows ?? [])
        .filter((row) => row.recipe_id === recipe.id)
        .map((row) => ({
          name: row.name,
          qty: row.qty,
          unit: row.unit,
          shopCategory: row.shop_category,
        })),
    }));

    const scores = new Map<string, number[]>();
    for (const row of ratingRows ?? []) {
      scores.set(row.recipe_id, [...(scores.get(row.recipe_id) ?? []), row.score]);
    }
    const ratings: Record<string, number> = {};
    for (const [id, values] of scores) {
      ratings[id] = values.reduce((a, b) => a + b, 0) / values.length;
    }

    /* 同じ主菜を空ける判定に使う、前の週までの主菜。 */
    const settings = toPlannerSettings(household);
    const { data: historyRows } = await supabase
      .from("meal_plan_items")
      .select("date, recipe_id")
      .eq("slot", "main")
      .gte("date", addDays(weekStart, -settings.repeatGapDays))
      .lt("date", weekStart);

    const history: MainHistory[] = (historyRows ?? [])
      .filter((row): row is { date: string; recipe_id: string } =>
        Boolean(row.recipe_id),
      )
      .map((row) => ({ recipeId: row.recipe_id, date: row.date }));

    let plan: GeneratedPlan | null = null;
    if (planRow) {
      const { data: items } = await supabase
        .from("meal_plan_items")
        .select("date, slot, recipe_id, entry_type, locked")
        .eq("plan_id", planRow.id)
        .order("date");

      plan = itemsToPlan(weekStart, items ?? []);
    }

    setData({
      householdId: household.id,
      settings,
      recipes,
      ratings,
      history,
      plan,
      confirmed: planRow?.status === "confirmed",
      sourceRecipes,
      master: (masterRows ?? []).map((row) => ({
        name: row.name,
        aliases: row.aliases,
        isPantry: row.is_pantry,
      })),
      householdServings: household.servings,
      includeSeasoning: household.include_seasoning_in_shopping,
    });
  }, [weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(plan: GeneratedPlan, confirmed = false) {
    if (!data) return;
    const supabase = createClient();

    const { data: planRow, error: planError } = await supabase
      .from("meal_plans")
      .upsert(
        {
          household_id: data.householdId,
          week_start: plan.weekStart,
          status: confirmed ? "confirmed" : "draft",
        },
        { onConflict: "household_id,week_start" },
      )
      .select("id")
      .single();

    if (planError || !planRow) throw new Error("保存できませんでした");

    await supabase.from("meal_plan_items").delete().eq("plan_id", planRow.id);

    /* 1日3行（主菜・副菜・汁物）。自炊しない日は1行だけ置く。 */
    type ItemInsert = {
      plan_id: string;
      date: string;
      slot: DishType;
      recipe_id: string | null;
      entry_type: EntryType;
      locked: boolean;
    };

    const items: ItemInsert[] = [];
    for (const day of plan.days) {
      if (day.entryType !== "cook") {
        items.push({
          plan_id: planRow.id,
          date: day.date,
          slot: "main",
          recipe_id: null,
          entry_type: day.entryType,
          locked: day.locked,
        });
        continue;
      }
      const slots: [DishType, string | null][] = [
        ["main", day.mainId],
        ["side", day.sideId],
        ["soup", day.soupId],
      ];
      for (const [slot, recipeId] of slots) {
        if (!recipeId) continue;
        items.push({
          plan_id: planRow.id,
          date: day.date,
          slot,
          recipe_id: recipeId,
          entry_type: "cook",
          locked: day.locked,
        });
      }
    }

    const { error: itemError } = await supabase
      .from("meal_plan_items")
      .insert(items);
    if (itemError) throw new Error("保存できませんでした");

    /* 確定したときだけ買い物リストを作り直す（仕様書 9章）。
       下書きのうちは作らない。買い物中に中身が入れ替わらないようにするため。 */
    if (!confirmed) return;

    const used = plan.days
      .filter((day) => day.entryType === "cook")
      .flatMap((day) => [day.mainId, day.sideId, day.soupId])
      .filter((id): id is string => Boolean(id));

    const list = buildShoppingList({
      usedRecipeIds: used,
      recipes: data.sourceRecipes,
      master: data.master,
      householdServings: data.householdServings,
      includeSeasoning: data.includeSeasoning,
    });

    await supabase.from("shopping_items").delete().eq("plan_id", planRow.id);

    if (list.length > 0) {
      const { error: shoppingError } = await supabase
        .from("shopping_items")
        .insert(
          list.map((item) => ({
            plan_id: planRow.id,
            name: item.name,
            total_qty: item.totalQty,
            unit: item.unit,
            shop_category: item.shopCategory,
            sort_order: item.sortOrder,
          })),
        );
      if (shoppingError) throw new Error("保存できませんでした");
    }
  }

  async function run(
    label: string,
    build: () => ReturnType<typeof generateWeek>,
    confirmed = false,
  ) {
    if (!data) return;
    setBusy(label);
    setError("");

    const result = build();
    if (!result.ok) {
      setBusy("");
      setError(
        `主菜が${result.have}件しかありません。あと${result.need - result.have}件登録すると献立を作れます。`,
      );
      return;
    }

    try {
      await persist(result.plan, confirmed);
      setData({ ...data, plan: result.plan, confirmed });
    } catch {
      setError("保存できませんでした。時間を置いてもう一度試してください。");
    }
    setBusy("");
    setPendingDate(null);
  }

  /* 手で決めた枠を保ったまま組み直すための土台。

     recomputeDate を渡すと、その日だけ主菜・副菜・汁物を選び直す。
     onlyLocked を渡すと、固定した日以外は全部組み直す（週の再生成）。 */
  function requestFrom(
    days: readonly PlanDay[],
    options: { onlyLocked?: boolean; recomputeDate?: string } = {},
  ) {
    const { onlyLocked = false, recomputeDate } = options;
    const cookDays = days.filter((day) => day.entryType === "cook");
    const keep = (day: PlanDay) => day.date !== recomputeDate;

    return {
      fixedDays: cookDays
        .filter(
          (day) => day.mainId && keep(day) && (onlyLocked ? day.locked : true),
        )
        .map((day) => ({ date: day.date, recipeId: day.mainId ?? "" })),
      noCookDays: days
        .filter((day) => day.entryType !== "cook")
        .map((day) => ({ date: day.date, entryType: day.entryType })),
      /* 週ごと組み直すとき以外は、副菜と汁物もそのまま残す。
         1日いじっただけで他の日の副菜が入れ替わると分かりにくい。 */
      fixedSides: onlyLocked
        ? []
        : cookDays
            .filter(keep)
            .map((day) => ({ date: day.date, recipeId: day.sideId })),
      fixedSoups: onlyLocked
        ? []
        : cookDays
            .filter(keep)
            .map((day) => ({ date: day.date, recipeId: day.soupId })),
    };
  }

  function build(request: Parameters<typeof generateWeek>[0]["request"]) {
    if (!data) throw new Error("読み込み前です");
    return generateWeek({
      weekStart,
      recipes: data.recipes,
      settings: data.settings,
      history: data.history,
      ratings: data.ratings,
      request,
      seed: Date.now() % 2147483647,
    });
  }

  const plan = data?.plan ?? null;

  function moveTo(next: string) {
    if (next === weekStart) return;
    setData(null); // 前の週の内容を出したままにしない
    setError("");
    setWeekStart(next);
  }

  function moveWeek(days: number) {
    moveTo(addDays(weekStart, days));
  }

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-24">
      <BackLink href="/">今日の献立</BackLink>

      <header className="pb-2">
        <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
          WEEK
        </p>
        <h1 className="mt-[7px] font-mincho text-[24px] font-bold tracking-[0.02em]">
          週間献立
        </h1>
      </header>

      {/* 週の切り替え。日曜始まりの7日間（変更記録 3.10）。 */}
      <div className="mt-2 flex items-center gap-2">
        <WeekButton
          disabled={busy !== ""}
          label="前の週"
          onClick={() => moveWeek(-7)}
        >
          ‹
        </WeekButton>

        <div className="flex-1 text-center">
          <p className="font-mono text-[11.5px] tracking-[0.06em] text-ink">
            {formatDay(weekStart).day} – {formatDay(addDays(weekStart, 6)).day}
          </p>
          {weekStart !== thisWeek ? (
            <button
              className="min-h-[28px] font-mono text-[9.5px] tracking-[0.12em] text-ai focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              onClick={() => moveTo(thisWeek)}
              type="button"
            >
              今週にもどる
            </button>
          ) : (
            <p className="font-mono text-[9.5px] tracking-[0.12em] text-ink-3">
              今週
            </p>
          )}
        </div>

        <WeekButton
          disabled={busy !== ""}
          label="次の週"
          onClick={() => moveWeek(7)}
        >
          ›
        </WeekButton>
      </div>

      {error ? (
        <p className="mt-3 text-[12.5px] leading-[1.8] text-meat" role="alert">
          {error}
        </p>
      ) : null}

      {data === null ? (
        <p className="mt-6 text-[12.5px] text-ink-3">読み込んでいます</p>
      ) : plan === null ? (
        <div className="mt-10 text-center">
          <p className="text-[12.5px] leading-[1.9] text-ink-2">
            今週の献立はまだありません。
            <br />
            作成すると7日分がまとめて決まります。
          </p>
          <button
            className="mt-6 min-h-[48px] w-full rounded-[11px] bg-ai text-[14px] font-medium tracking-[0.03em] text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            disabled={busy !== ""}
            onClick={() => void run("生成", () => build({}))}
            type="button"
          >
            {busy ? "組んでいます" : "今週の献立を作る"}
          </button>
        </div>
      ) : (
        <>
          {data.confirmed ? (
            <div className="mt-3 flex items-center gap-3">
              <p className="text-[12px] text-soy" role="status">
                この内容で確定しています
              </p>
              <Link
                className="ml-auto min-h-[38px] rounded-[9px] border border-line px-3 py-2 text-[12px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                href="/shopping/"
              >
                買い物リスト
              </Link>
            </div>
          ) : null}

          <Violations violations={plan.violations} />

          <WeekView
            onReroll={(date) => {
              setPendingDate(date);
              void run("差し替え", () =>
                rerollDay({
                  plan: structuredClone(plan),
                  date,
                  recipes: data.recipes,
                  settings: data.settings,
                  history: data.history,
                  ratings: data.ratings,
                  seed: Date.now() % 2147483647,
                }),
              );
            }}
            onSetEntryType={(date, entryType: EntryType) => {
              const days = plan.days.map((day) =>
                day.date === date ? { ...day, entryType } : day,
              );
              void run("変更", () => build(requestFrom(days)));
            }}
            onSetMain={(date, recipeId) => {
              const days = plan.days.map((day) =>
                day.date === date
                  ? { ...day, mainId: recipeId, entryType: "cook" as const }
                  : day,
              );
              void run("変更", () => build(requestFrom(days)));
            }}
            onSetSide={(date, recipeId) => {
              const days = plan.days.map((day) =>
                day.date === date ? { ...day, sideId: recipeId } : day,
              );
              void run("変更", () => build(requestFrom(days)));
            }}
            onSetSoup={(date, recipeId) => {
              const days = plan.days.map((day) =>
                day.date === date ? { ...day, soupId: recipeId } : day,
              );
              void run("変更", () => build(requestFrom(days)));
            }}
            onToggleLock={(date) => {
              const days = plan.days.map((day) =>
                day.date === date ? { ...day, locked: !day.locked } : day,
              );
              void run("変更", () => {
                const result = build(requestFrom(days));
                if (result.ok) {
                  for (const day of result.plan.days) {
                    day.locked =
                      days.find((d) => d.date === day.date)?.locked ?? false;
                  }
                }
                return result;
              });
            }}
            pendingDate={pendingDate}
            plan={plan}
            recipes={data.recipes}
          />

          <div className="mt-5 flex gap-[9px]">
            <button
              className="min-h-[48px] flex-1 rounded-[11px] border border-line text-[13.5px] text-ink disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              disabled={busy !== ""}
              onClick={() =>
                void run("再生成", () => build(requestFrom(plan.days, { onlyLocked: true })))
              }
              type="button"
            >
              週を再生成
            </button>
            <button
              className="min-h-[48px] flex-1 rounded-[11px] bg-ai text-[13.5px] font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              disabled={busy !== "" || data.confirmed}
              onClick={() =>
                void run("確定", () => build(requestFrom(plan.days)), true)
              }
              type="button"
            >
              {data.confirmed ? "確定しました" : "この内容で確定"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

function WeekButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-[44px] w-[44px] items-center justify-center rounded-[10px] border border-line text-[18px] text-ink-2 disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/* DB の行から画面の形へ。1日3行（主菜・副菜・汁物）で持っている。 */
function itemsToPlan(
  weekStart: string,
  items: readonly {
    date: string;
    slot: string;
    recipe_id: string | null;
    entry_type: EntryType;
    locked: boolean;
  }[],
): GeneratedPlan {
  const days: PlanDay[] = Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    entryType: "cook",
    locked: false,
    mainId: null,
    sideId: null,
    soupId: null,
  }));

  for (const item of items) {
    const day = days.find((d) => d.date === item.date);
    if (!day) continue;
    day.entryType = item.entry_type;
    day.locked = day.locked || item.locked;
    if (item.slot === "main") day.mainId = item.recipe_id;
    if (item.slot === "side") day.sideId = item.recipe_id;
    if (item.slot === "soup") day.soupId = item.recipe_id;
  }

  return { weekStart, days, violations: [], attempts: 0 };
}
