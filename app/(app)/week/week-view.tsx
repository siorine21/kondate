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

/* その日の扱い。未定は entry_type ではなく「行がまだ無い」状態を指す。 */
export type DayState = EntryType | "undecided";

const STATE_LABEL: Record<DayState, string> = {
  undecided: "未定",
  cook: "作る",
  eatout: "外食",
  batch: "作りおき",
  leftover: "残りもの",
};

const STATE_ORDER: readonly DayState[] = [
  "undecided",
  "cook",
  "eatout",
  "batch",
  "leftover",
];

const stateOf = (day: PlanDay): DayState =>
  day.undecided ? "undecided" : day.entryType;

const PROTEIN_BAR: Record<string, string> = {
  ...PROTEIN_BG,
  none: "bg-line",
};

export function WeekView({
  plan,
  recipes,
  requestedIds,
  pendingDate,
  onReroll,
  onToggleLock,
  onSetDayState,
  onSetMain,
  onSetSide,
  onSetSoup,
}: {
  plan: GeneratedPlan;
  recipes: readonly PlannerRecipe[];
  /* リクエストされていて、まだ献立に入っていない主菜。
     選び直す一覧の先頭に出す（変更記録 3.20）。 */
  requestedIds: readonly string[];
  pendingDate: string | null;
  onReroll: (date: string) => void;
  onToggleLock: (date: string) => void;
  onSetDayState: (date: string, state: DayState) => void;
  onSetMain: (date: string, recipeId: string) => void;
  onSetSide: (date: string, recipeId: string | null) => void;
  onSetSoup: (date: string, recipeId: string | null) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const byId = (id: string | null) =>
    recipes.find((recipe) => recipe.id === id) ?? null;

  return (
    <>
      {/* 7分割のたんぱく源リボン */}
      <div
        aria-label="たんぱく源の並び"
        className="mt-4 flex h-[10px] w-full overflow-hidden rounded-[5px]"
        role="img"
      >
        {plan.days.map((day) => {
          const main = byId(day.mainId);
          const protein =
            day.entryType === "cook" && !day.undecided
              ? main?.mainProtein
              : "none";
          return (
            <span
              className={`flex-1 ${PROTEIN_BAR[protein ?? "none"]}`}
              key={day.date}
              title={`${formatDay(day.date).day} ${main?.name ?? STATE_LABEL[stateOf(day)]}`}
            />
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {plan.days.map((day) => (
          <DayCard
            byId={byId}
            day={day}
            requestedIds={requestedIds}
            editing={editing === day.date}
            key={day.date}
            onSetDayState={onSetDayState}
            onSetMain={onSetMain}
            onSetSide={onSetSide}
            onSetSoup={onSetSoup}
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
  requestedIds,
  editing,
  pending,
  onToggleEdit,
  onReroll,
  onToggleLock,
  onSetDayState,
  onSetMain,
  onSetSide,
  onSetSoup,
}: {
  day: PlanDay;
  byId: (id: string | null) => PlannerRecipe | null;
  recipes: readonly PlannerRecipe[];
  requestedIds: readonly string[];
  editing: boolean;
  pending: boolean;
  onToggleEdit: () => void;
  onReroll: (date: string) => void;
  onToggleLock: (date: string) => void;
  onSetDayState: (date: string, state: DayState) => void;
  onSetMain: (date: string, recipeId: string) => void;
  onSetSide: (date: string, recipeId: string | null) => void;
  onSetSoup: (date: string, recipeId: string | null) => void;
}) {
  const { day: label, weekday } = formatDay(day.date);
  const main = byId(day.mainId);
  const side = byId(day.sideId);
  const soup = byId(day.soupId);
  const cooking = day.entryType === "cook" && !day.undecided;
  const spine = cooking ? PROTEIN_BAR[main?.mainProtein ?? "none"] : "bg-line";

  return (
    <article className="flex overflow-hidden rounded-card border border-line bg-card">
      <span aria-hidden className={`w-[4px] flex-shrink-0 ${spine}`} />

      <div className="min-w-0 flex-1 p-3.5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] tracking-[0.1em] text-ink-3">
            {label}
          </span>
          <span className="font-mincho text-[13px] text-ink-2">{weekday}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {main && cooking ? (
              <>
                <Tag>{CATEGORY_LABEL[main.category]}</Tag>
                <Tag>{main.cookTimeMin}分</Tag>
              </>
            ) : (
              <Tag>{STATE_LABEL[stateOf(day)]}</Tag>
            )}
            <LockButton
              locked={day.locked}
              onClick={() => onToggleLock(day.date)}
            />
          </span>
        </div>

        {day.undecided ? (
          <p className="mt-2 text-[13px] text-ink-2">
            まだ決めていません。「変更」から決められます。
          </p>
        ) : day.entryType !== "cook" ? (
          <p className="mt-2 text-[13px] text-ink-2">
            この日は{STATE_LABEL[day.entryType]}にしています。
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
            disabled={pending || day.locked || !cooking}
            grow={2}
            onClick={() => onReroll(day.date)}
          >
            {pending ? "選び直しています" : "おまかせで選び直す"}
          </SmallButton>
          <SmallButton onClick={onToggleEdit}>
            {editing ? "閉じる" : "変更"}
          </SmallButton>
        </div>

        {editing ? (
          <DayEditor
            day={day}
            onSetDayState={onSetDayState}
            onSetMain={(id) => {
              onSetMain(day.date, id);
              onToggleEdit();
            }}
            onSetSide={(id) => onSetSide(day.date, id)}
            onSetSoup={(id) => onSetSoup(day.date, id)}
            recipes={recipes}
            requestedIds={requestedIds}
          />
        ) : null}
      </div>
    </article>
  );
}

function DayEditor({
  day,
  recipes,
  requestedIds,
  onSetDayState,
  onSetMain,
  onSetSide,
  onSetSoup,
}: {
  day: PlanDay;
  recipes: readonly PlannerRecipe[];
  requestedIds: readonly string[];
  onSetDayState: (date: string, state: DayState) => void;
  onSetMain: (id: string) => void;
  onSetSide: (id: string | null) => void;
  onSetSoup: (id: string | null) => void;
}) {
  const mains = recipes.filter((recipe) => recipe.dishType === "main");
  const sides = recipes.filter((recipe) => recipe.dishType === "side");
  const soups = recipes.filter((recipe) => recipe.dishType === "soup");

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
        この日の扱い
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {STATE_ORDER.map((state) => (
          <button
            aria-pressed={stateOf(day) === state}
            className={`min-h-[38px] rounded-[8px] border px-3 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
              stateOf(day) === state
                ? "border-ai bg-ai-soft font-medium text-ai"
                : "border-line text-ink-2"
            }`}
            key={state}
            onClick={() => onSetDayState(day.date, state)}
            type="button"
          >
            {STATE_LABEL[state]}
          </button>
        ))}
      </div>

      {day.entryType === "cook" && !day.undecided ? (
        <>
          <Picker
            candidates={mains}
            label="主菜を選び直す"
            onPick={(id) => id && onSetMain(id)}
            requestedIds={requestedIds}
            selectedId={day.mainId}
          />
          <Picker
            allowNone
            candidates={sides}
            label="副菜（つけなくてもよい）"
            onPick={onSetSide}
            selectedId={day.sideId}
          />
          <Picker
            allowNone
            candidates={soups}
            label="汁物（つけなくてもよい）"
            onPick={onSetSoup}
            selectedId={day.soupId}
          />
        </>
      ) : null}
    </div>
  );
}

/* 品を選ぶ一覧。allowNone を付けると「つけない」を選べる。 */
function Picker({
  label,
  candidates,
  selectedId,
  allowNone,
  requestedIds = [],
  onPick,
}: {
  label: string;
  candidates: readonly PlannerRecipe[];
  selectedId: string | null;
  allowNone?: boolean;
  requestedIds?: readonly string[];
  onPick: (id: string | null) => void;
}) {
  if (candidates.length === 0) return null;

  /* リクエストされたものを先頭に持ち上げる。並べ替えるだけで、
     元の並びは崩さない（同じ組の中では今までどおり）。 */
  const requested = new Set(requestedIds);
  const ordered = [
    ...candidates.filter((recipe) => requested.has(recipe.id)),
    ...candidates.filter((recipe) => !requested.has(recipe.id)),
  ];

  return (
    <>
      <p className="mt-3 font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
        {label}
      </p>
      <div className="mt-1.5 max-h-[220px] overflow-y-auto rounded-[9px] border border-line">
        {allowNone ? (
          <button
            className={`flex min-h-[42px] w-full items-center border-b border-line/60 px-3 text-left text-[13px] text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
              selectedId === null ? "bg-ai-soft" : ""
            }`}
            onClick={() => onPick(null)}
            type="button"
          >
            つけない
          </button>
        ) : null}
        {ordered.map((recipe) => (
          <button
            className={`flex min-h-[42px] w-full items-center gap-2 border-b border-line/60 px-3 text-left text-[13px] last:border-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
              recipe.id === selectedId ? "bg-ai-soft" : ""
            }`}
            key={recipe.id}
            onClick={() => onPick(recipe.id)}
            type="button"
          >
            <span
              className={`h-[7px] w-[7px] flex-shrink-0 rounded-full ${PROTEIN_BAR[recipe.mainProtein]}`}
            />
            <span className="min-w-0 flex-1 truncate">{recipe.name}</span>
            {requested.has(recipe.id) ? (
              <span className="flex-shrink-0 rounded-[4px] bg-ai px-1.5 py-[2px] font-mono text-[9px] tracking-[0.1em] text-white">
                リクエスト
              </span>
            ) : null}
            <span className="font-mono text-[10.5px] text-ink-3">
              {recipe.cookTimeMin}分
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/* 固定の鍵。カードの右上に置く。

   絵文字は端末によって形も色も変わるため、自分で描く。
   閉じているときは面で塗り、開いているときは線だけにして、
   形と濃さの両方で違いが出るようにする。 */
function LockButton({
  locked,
  onClick,
}: {
  locked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={locked ? "固定を外す" : "この日を固定する"}
      aria-pressed={locked}
      className={`flex h-[44px] w-[44px] items-center justify-center rounded-[10px] border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
        locked
          ? "border-ai bg-ai text-white"
          : "border-line bg-card text-ink-3"
      }`}
      onClick={onClick}
      type="button"
    >
      <svg
        aria-hidden
        fill="none"
        height="20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
        viewBox="0 0 24 24"
        width="20"
      >
        {/* つる。閉じているときは本体につながり、開いているときは外れる。 */}
        <path
          d={
            locked
              ? /* 両脚が本体に入る。閉じている。 */
                "M8 10.5V7a4 4 0 0 1 8 0v3.5"
              : /* 左脚を短く止めて本体から離す。外れている。 */
                "M16 10.5V7a4 4 0 0 0-8 0v1"
          }
        />
        {/* 本体。閉じているときだけ塗る。 */}
        <rect
          fill={locked ? "currentColor" : "none"}
          height="10"
          rx="2.2"
          width="14"
          x="5"
          y="10.5"
        />
        {locked ? (
          <circle cx="12" cy="15.5" fill="var(--color-ai)" r="1.4" stroke="none" />
        ) : null}
      </svg>
    </button>
  );
}

function SmallButton({
  children,
  disabled,
  grow,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  grow?: 2;
  onClick: () => void;
}) {
  return (
    <button
      className={`min-h-[42px] rounded-[8px] border border-line px-2 text-[12px] text-ink disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
        grow === 2 ? "flex-[2]" : "flex-1"
      }`}
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
    <span className="rounded-[5px] bg-chip px-2 py-[3px] font-mono text-[9.5px] tracking-[0.08em] text-ink-2">
      {children}
    </span>
  );
}
