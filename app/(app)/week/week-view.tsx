"use client";

import Link from "next/link";
import { useState } from "react";

import {
  CATEGORY_LABEL,
  DISH_TYPE_LABEL,
  PROTEIN_BG,
  PROTEIN_LABEL,
} from "@/lib/labels";
import { formatDay } from "@/lib/plan-mapping";
import type { GeneratedPlan, PlanDay, PlannerRecipe } from "@/lib/planner";
import type { EntryType } from "@/lib/supabase/types";

/* 週間献立の表示（仕様書 5.2-3）。

   たんぱく源リボン、各日カード、1日差し替え、手動編集。
   計算は planner が済ませたものを受け取るだけで、ここでは組まない。 */

const ENTRY_LABEL: Record<EntryType, string> = {
  cook: "作る",
  eatout: "外食",
  batch: "作りおき",
  leftover: "残りもの",
};

const PROTEIN_BAR: Record<string, string> = {
  ...PROTEIN_BG,
  none: "bg-line",
};

export function WeekView({
  plan,
  recipes,
  pendingDate,
  onReroll,
  onToggleLock,
  onSetEntryType,
  onSetMain,
}: {
  plan: GeneratedPlan;
  recipes: readonly PlannerRecipe[];
  pendingDate: string | null;
  onReroll: (date: string) => void;
  onToggleLock: (date: string) => void;
  onSetEntryType: (date: string, entryType: EntryType) => void;
  onSetMain: (date: string, recipeId: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const byId = (id: string | null) =>
    recipes.find((recipe) => recipe.id === id) ?? null;

  return (
    <>
      {/* 7分割のたんぱく源リボン */}
      <div className="mt-4 flex h-[10px] w-full overflow-hidden rounded-[5px]">
        {plan.days.map((day) => {
          const main = byId(day.mainId);
          const protein = day.entryType === "cook" ? main?.mainProtein : "none";
          return (
            <span
              className={`flex-1 ${PROTEIN_BAR[protein ?? "none"]}`}
              key={day.date}
              title={`${formatDay(day.date).day} ${main?.name ?? ENTRY_LABEL[day.entryType]}`}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {plan.days.map((day) => (
          <DayCard
            byId={byId}
            day={day}
            editing={editing === day.date}
            key={day.date}
            onSetEntryType={onSetEntryType}
            onSetMain={onSetMain}
            onToggleEdit={() =>
              setEditing((current) => (current === day.date ? null : day.date))
            }
            onToggleLock={onToggleLock}
            onReroll={onReroll}
            pending={pendingDate === day.date}
            recipes={recipes}
          />
        ))}
      </div>
    </>
  );
}

function DayCard({
  day,
  byId,
  recipes,
  editing,
  pending,
  onToggleEdit,
  onReroll,
  onToggleLock,
  onSetEntryType,
  onSetMain,
}: {
  day: PlanDay;
  byId: (id: string | null) => PlannerRecipe | null;
  recipes: readonly PlannerRecipe[];
  editing: boolean;
  pending: boolean;
  onToggleEdit: () => void;
  onReroll: (date: string) => void;
  onToggleLock: (date: string) => void;
  onSetEntryType: (date: string, entryType: EntryType) => void;
  onSetMain: (date: string, recipeId: string) => void;
}) {
  const { day: label, weekday } = formatDay(day.date);
  const main = byId(day.mainId);
  const side = byId(day.sideId);
  const soup = byId(day.soupId);
  const spine = day.entryType === "cook" ? PROTEIN_BAR[main?.mainProtein ?? "none"] : "bg-line";

  return (
    <article className="flex overflow-hidden rounded-card border border-line bg-card">
      <span aria-hidden className={`w-[4px] flex-shrink-0 ${spine}`} />

      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink-3">
            {label}
          </span>
          <span className="font-mincho text-[13px] text-ink-2">{weekday}</span>
          {day.locked ? (
            <span aria-label="固定" className="text-[11px]" role="img">
              🔒
            </span>
          ) : null}
          <span className="ml-auto flex gap-1.5">
            {main && day.entryType === "cook" ? (
              <>
                <Tag>{CATEGORY_LABEL[main.category]}</Tag>
                <Tag>{main.cookTimeMin}分</Tag>
              </>
            ) : (
              <Tag>{ENTRY_LABEL[day.entryType]}</Tag>
            )}
          </span>
        </div>

        {day.entryType !== "cook" ? (
          <p className="mt-2 text-[13px] text-ink-2">
            この日は{ENTRY_LABEL[day.entryType]}にしています。
          </p>
        ) : main ? (
          <>
            <Link
              className="mt-1.5 block text-[15.5px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
              href={`/recipe/?id=${main.id}`}
            >
              {main.name}
            </Link>
            <p className="mt-[3px] font-mono text-[10.5px] text-ink-3">
              {PROTEIN_LABEL[main.mainProtein]} ·{" "}
              {DISH_TYPE_LABEL[main.dishType]}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-[1.8] text-ink-2">
              {side ? side.name : "副菜なし"} / {soup ? soup.name : "汁物なし"}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13px] text-ink-2">主菜が決まっていません。</p>
        )}

        <div className="mt-2.5 flex gap-1.5">
          <SmallButton
            disabled={pending || day.locked || day.entryType !== "cook"}
            onClick={() => onReroll(day.date)}
          >
            {pending ? "選び直しています" : "差し替え"}
          </SmallButton>
          <SmallButton onClick={() => onToggleLock(day.date)}>
            {day.locked ? "固定を外す" : "固定する"}
          </SmallButton>
          <SmallButton onClick={onToggleEdit}>
            {editing ? "閉じる" : "変える"}
          </SmallButton>
        </div>

        {editing ? (
          <DayEditor
            day={day}
            onSetEntryType={onSetEntryType}
            onSetMain={(id) => {
              onSetMain(day.date, id);
              onToggleEdit();
            }}
            recipes={recipes}
          />
        ) : null}
      </div>
    </article>
  );
}

function DayEditor({
  day,
  recipes,
  onSetEntryType,
  onSetMain,
}: {
  day: PlanDay;
  recipes: readonly PlannerRecipe[];
  onSetEntryType: (date: string, entryType: EntryType) => void;
  onSetMain: (id: string) => void;
}) {
  const mains = recipes.filter((recipe) => recipe.dishType === "main");

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
        この日の扱い
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {(["cook", "eatout", "batch", "leftover"] as const).map((entryType) => (
          <button
            aria-pressed={day.entryType === entryType}
            className={`min-h-[36px] rounded-[8px] border px-3 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
              day.entryType === entryType
                ? "border-ai bg-ai-soft text-ai"
                : "border-line text-ink-2"
            }`}
            key={entryType}
            onClick={() => onSetEntryType(day.date, entryType)}
            type="button"
          >
            {ENTRY_LABEL[entryType]}
          </button>
        ))}
      </div>

      {day.entryType === "cook" ? (
        <>
          <p className="mt-3 font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
            主菜を選び直す
          </p>
          <div className="mt-1.5 max-h-[220px] overflow-y-auto rounded-[9px] border border-line">
            {mains.map((recipe) => (
              <button
                className={`flex w-full items-center gap-2 border-b border-[#EFF1EC] px-3 py-2.5 text-left text-[13px] last:border-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
                  recipe.id === day.mainId ? "bg-ai-soft" : ""
                }`}
                key={recipe.id}
                onClick={() => onSetMain(recipe.id)}
                type="button"
              >
                <span
                  className={`h-[7px] w-[7px] flex-shrink-0 rounded-full ${PROTEIN_BAR[recipe.mainProtein]}`}
                />
                <span className="min-w-0 flex-1 truncate">{recipe.name}</span>
                <span className="font-mono text-[10.5px] text-ink-3">
                  {recipe.cookTimeMin}分
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function SmallButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="min-h-[38px] flex-1 rounded-[8px] border border-line px-2 text-[12px] text-ink disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-[5px] bg-[#EDF0EA] px-2 py-[3px] font-mono text-[9.5px] tracking-[0.08em] text-ink-2">
      {children}
    </span>
  );
}
