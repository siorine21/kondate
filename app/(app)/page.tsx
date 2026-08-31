"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PROTEIN_BG, PROTEIN_LABEL } from "@/lib/labels";
import { addDays, formatDay, itemsToPlan, toPlannerRecipe, weekStartOf } from "@/lib/plan-mapping";
import type { PlanDay, PlannerRecipe } from "@/lib/planner";
import { createClient } from "@/lib/supabase/client";
import { findDay, prepNote, todayIso } from "@/lib/today";

import { SettingsLink } from "./settings-link";

/* 今日の献立（仕様書 5.2-2 / Phase 7）。

   起動したときに最初に出る画面なので、いま知りたいことだけを置く。
   今日の3品、明日の下ごしらえ、買い残しの数。 */

type Loaded = {
  today: PlanDay | null;
  tomorrow: PlanDay | null;
  byId: (id: string | null) => PlannerRecipe | null;
  memos: Record<string, string | null>;
  remaining: number;
  hasPlan: boolean;
};

const STATE_TEXT: Record<string, string> = {
  eatout: "この日は外食にしています。",
  batch: "この日は作りおきにしています。",
  leftover: "この日は残りものにしています。",
};

export default function TodayPage() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [date] = useState(() => todayIso());

  const load = useCallback(async () => {
    const supabase = createClient();
    const weekStart = weekStartOf(new Date());

    const [{ data: plan }, { data: recipeRows }, { data: ingredientRows }] =
      await Promise.all([
        supabase
          .from("meal_plans")
          .select("id, status")
          .eq("week_start", weekStart)
          .maybeSingle(),
        supabase.from("recipes").select("*"),
        supabase.from("recipe_ingredients").select("recipe_id, name"),
      ]);

    const names = new Map<string, string[]>();
    for (const row of ingredientRows ?? []) {
      names.set(row.recipe_id, [...(names.get(row.recipe_id) ?? []), row.name]);
    }
    const recipes = (recipeRows ?? []).map((recipe) =>
      toPlannerRecipe(recipe, names.get(recipe.id) ?? []),
    );
    const byId = (id: string | null) =>
      recipes.find((recipe) => recipe.id === id) ?? null;
    const memos: Record<string, string | null> = {};
    for (const recipe of recipeRows ?? []) memos[recipe.id] = recipe.memo;

    /* 確定していない週は「まだ決まっていない」として扱う（仕様書 5.2-2）。
       下書きを今日の献立として出すと、変わる前提のものを確定と見せてしまう。 */
    if (!plan || plan.status !== "confirmed") {
      setData({
        today: null,
        tomorrow: null,
        byId,
        memos,
        remaining: 0,
        hasPlan: false,
      });
      return;
    }

    const [{ data: items }, { data: shopping }] = await Promise.all([
      supabase
        .from("meal_plan_items")
        .select("date, slot, recipe_id, entry_type, locked")
        .eq("plan_id", plan.id)
        .order("date"),
      supabase
        .from("shopping_items")
        .select("id")
        .eq("plan_id", plan.id)
        .eq("checked", false),
    ]);

    const built = itemsToPlan(weekStart, items ?? []);
    setData({
      today: findDay(built.days, date),
      tomorrow: findDay(built.days, addDays(date, 1)),
      byId,
      memos,
      remaining: (shopping ?? []).length,
      hasPlan: true,
    });
  }, [date]);

  useEffect(() => {
    void load().catch(() => setError("読み込めませんでした。開き直してください。"));
  }, [load]);

  const { day: label, weekday } = formatDay(date);

  return (
    <main className="mx-auto w-full max-w-[430px] px-5 pb-16">
      <div className="flex justify-end pt-2">
        <SettingsLink />
      </div>

      <p className="mt-1 font-mono text-[9.5px] tracking-[0.24em] text-ink-3">
        TODAY · {label}
      </p>
      <h1 className="mt-1 font-mincho text-[26px] font-bold tracking-[0.06em] text-ink">
        {weekday}曜日の献立
      </h1>

      {error ? (
        <p className="mt-4 text-[12.5px] leading-[1.8] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {data === null ? (
        <p className="mt-8 text-[12.5px] text-ink-3">読み込んでいます</p>
      ) : !data.hasPlan ? (
        <div className="mt-12 text-center">
          <p className="text-[12.5px] leading-[1.9] text-ink-2">
            今週の献立はまだ決まっていません。
            <br />
            作成すると 7 日分がまとめて決まります。
          </p>
          <Link
            className="mt-7 inline-flex min-h-[48px] w-full max-w-[280px] items-center justify-center rounded-[11px] bg-ai text-[13.5px] font-medium tracking-[0.03em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            href="/week/"
          >
            今週の献立を作る
          </Link>
          <Nav />
        </div>
      ) : (
        <>
          <TodayCard byId={data.byId} day={data.today} />

          {data.remaining > 0 ? (
            <Link
              className="mt-3 flex items-center gap-3 rounded-card border border-line bg-card px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              href="/shopping/"
            >
              <span className="text-[13.5px] text-ink">
                未購入 {data.remaining} 品
              </span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                買い物リスト ›
              </span>
            </Link>
          ) : null}

          <TomorrowCard
            byId={data.byId}
            day={data.tomorrow}
            memos={data.memos}
          />

          <Nav />
        </>
      )}
    </main>
  );
}

/* 今日の3品。品名はどれもレシピ詳細へ飛べる（仕様書 5.4）。 */
function TodayCard({
  day,
  byId,
}: {
  day: PlanDay | null;
  byId: (id: string | null) => PlannerRecipe | null;
}) {
  if (!day || day.undecided) {
    return (
      <p className="mt-6 text-[13px] leading-[1.9] text-ink-2">
        今日はまだ決めていません。
        <br />
        週間献立から選ぶと、ここに出ます。
      </p>
    );
  }

  if (day.entryType !== "cook") {
    return (
      <p className="mt-6 text-[13px] leading-[1.9] text-ink-2">
        {STATE_TEXT[day.entryType] ?? "この日は自炊しません。"}
      </p>
    );
  }

  const main = byId(day.mainId);
  const side = byId(day.sideId);
  const soup = byId(day.soupId);

  if (!main) {
    return (
      <p className="mt-6 text-[13px] leading-[1.9] text-ink-2">
        今日の主菜が決まっていません。
        <br />
        週間献立から選べます。
      </p>
    );
  }

  return (
    <section className="mt-5 overflow-hidden rounded-card border border-line bg-card">
      <div className="flex">
        <span
          aria-hidden
          className={`w-[4px] flex-shrink-0 ${PROTEIN_BG[main.mainProtein]}`}
        />
        <div className="min-w-0 flex-1 p-4">
          <Link
            className="block text-[19px] font-medium leading-[1.5] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
            href={`/recipe/?id=${main.id}`}
          >
            {main.name}
          </Link>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-2">
            <span
              aria-hidden
              className={`h-[8px] w-[8px] rounded-full ${PROTEIN_BG[main.mainProtein]}`}
            />
            {PROTEIN_LABEL[main.mainProtein]}
            <span className="font-mono text-[10.5px] text-ink-3">
              · {main.cookTimeMin}分
            </span>
          </p>

          <ul className="mt-3 flex flex-col gap-1.5 border-t border-line/60 pt-3">
            <SideRow dish={side} label="副菜" />
            <SideRow dish={soup} label="汁物" />
          </ul>
        </div>
      </div>
    </section>
  );
}

function SideRow({
  label,
  dish,
}: {
  label: string;
  dish: PlannerRecipe | null;
}) {
  return (
    /* 指で押す前提なので、行の中でも上下に余白を取る（変更記録 3.23 と同じ）。 */
    <li className="flex items-center gap-2.5">
      <span className="w-[30px] flex-shrink-0 font-mono text-[9.5px] tracking-[0.1em] text-ink-3">
        {label}
      </span>
      {dish ? (
        <Link
          className="min-w-0 flex-1 py-1.5 text-[13.5px] text-ink underline decoration-line underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          href={`/recipe/?id=${dish.id}`}
        >
          {dish.name}
        </Link>
      ) : (
        <span className="min-w-0 flex-1 py-1.5 text-[13.5px] text-ink-3">
          つけません
        </span>
      )}
    </li>
  );
}

/* 明日の下ごしらえ（仕様書 5.2-2）。
   前の晩にできることがあるときだけ意味があるので、
   自炊しない日と、言うことが無い日は出さない。 */
function TomorrowCard({
  day,
  byId,
  memos,
}: {
  day: PlanDay | null;
  byId: (id: string | null) => PlannerRecipe | null;
  memos: Record<string, string | null>;
}) {
  if (!day || day.undecided || day.entryType !== "cook") return null;
  const main = byId(day.mainId);
  if (!main) return null;

  const note = prepNote(main, memos[main.id] ?? null);
  const { weekday } = formatDay(day.date);

  return (
    <section className="mt-3 rounded-card border border-line bg-card p-4">
      <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
        明日（{weekday}）の下ごしらえ
      </p>
      <Link
        className="mt-1.5 block text-[14.5px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        href={`/recipe/?id=${main.id}`}
      >
        {main.name}
      </Link>
      <p className="mt-1.5 text-[12px] leading-[1.8] text-ink-2">
        {note ?? "前の晩にしておくことはありません。"}
      </p>
    </section>
  );
}

function Nav() {
  const item =
    "flex min-h-[48px] flex-1 items-center justify-center rounded-[11px] border border-line text-[13px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";
  return (
    <nav aria-label="ほかの画面" className="mt-7">
      <div className="flex gap-2">
        <Link className={item} href="/week/">
          週間献立
        </Link>
        <Link className={item} href="/shopping/">
          買い物リスト
        </Link>
      </div>
      <div className="mt-2 flex gap-2">
        <Link className={item} href="/nutrition/">
          栄養サマリ
        </Link>
        <Link className={item} href="/recipes/">
          レシピ
        </Link>
      </div>
    </nav>
  );
}
