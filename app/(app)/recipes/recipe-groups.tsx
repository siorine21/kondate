"use client";

import Link from "next/link";
import { useState } from "react";

import {
  CATEGORY_LABEL,
  CATEGORY_LABEL_LONG,
  DISH_TYPE_LABEL,
  PROTEIN_BG,
  PROTEIN_LABEL,
} from "@/lib/labels";
import type {
  DishType,
  MainProtein,
  RecipeCategory,
} from "@/lib/supabase/types";

/* 登録済みレシピの一覧。まとまりごとに畳める。

   分け方は 2 つ用意した。「カテゴリ」は仕様書では和洋中を指すが、
   献立を組むときに効くのは主菜・副菜・汁物のほうなので、そちらを既定にする。 */

export type RecipeRow = {
  id: string;
  name: string;
  category: RecipeCategory;
  dish_type: DishType;
  main_protein: MainProtein;
  cook_time_min: number;
};

type GroupBy = "dish_type" | "category";

/* 表示順。データの並びに引きずられないよう、ここで決める。 */
const DISH_TYPE_ORDER: readonly DishType[] = ["main", "side", "soup", "rice"];
const CATEGORY_ORDER: readonly RecipeCategory[] = [
  "washoku",
  "yoshoku",
  "chuka",
  "other",
];

export function RecipeGroups({ recipes }: { recipes: readonly RecipeRow[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("dish_type");
  const [closed, setClosed] = useState<readonly string[]>([]);

  const keys = groupBy === "dish_type" ? DISH_TYPE_ORDER : CATEGORY_ORDER;
  const label = (key: string) =>
    groupBy === "dish_type"
      ? DISH_TYPE_LABEL[key as DishType]
      : CATEGORY_LABEL_LONG[key as RecipeCategory];

  const groups = keys
    .map((key) => ({
      key,
      label: label(key),
      rows: recipes.filter((recipe) => recipe[groupBy] === key),
    }))
    .filter((group) => group.rows.length > 0);

  function toggle(key: string) {
    setClosed((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );
  }

  const allClosed = closed.length === groups.length;

  return (
    <>
      <div className="mt-2.5 flex items-center gap-2">
        <Switch
          onChange={(next) => {
            setGroupBy(next);
            setClosed([]); // 分け方を変えたら畳んだ状態は持ち越さない
          }}
          value={groupBy}
        />
        <button
          className="ml-auto min-h-[38px] px-2 font-mono text-[10px] tracking-[0.12em] text-ai focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() =>
            setClosed(allClosed ? [] : groups.map((group) => group.key))
          }
          type="button"
        >
          {allClosed ? "すべて開く" : "すべて畳む"}
        </button>
      </div>

      {groups.map((group) => {
        const open = !closed.includes(group.key);
        const panelId = `group-${group.key}`;

        return (
          <section key={group.key}>
            <h3>
              <button
                aria-controls={panelId}
                aria-expanded={open}
                className="flex min-h-[48px] w-full items-center gap-2 border-b border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                onClick={() => toggle(group.key)}
                type="button"
              >
                <span className="text-[14px] font-medium text-ink">
                  {group.label}
                </span>
                <span className="font-mono text-[10.5px] text-ink-3">
                  {group.rows.length}
                </span>
                <span
                  aria-hidden
                  className={`ml-auto text-[15px] text-ink-3 transition-transform ${
                    open ? "rotate-90" : ""
                  }`}
                >
                  ›
                </span>
              </button>
            </h3>

            {open ? (
              <ul id={panelId}>
                {group.rows.map((recipe) => (
                  <li key={recipe.id}>
                    <Link
                      className="flex items-center gap-3 border-b border-line py-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
                      href={`/recipe/?id=${recipe.id}`}
                    >
                      <span
                        className={`flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-[9px] font-mono text-[10px] text-white ${PROTEIN_BG[recipe.main_protein]}`}
                      >
                        {PROTEIN_LABEL[recipe.main_protein]}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[14.5px] font-medium">
                          {recipe.name}
                        </span>
                        <span className="mt-[3px] block font-mono text-[10.5px] text-ink-3">
                          {CATEGORY_LABEL[recipe.category]} ·{" "}
                          {DISH_TYPE_LABEL[recipe.dish_type]} ·{" "}
                          {recipe.cook_time_min}分
                        </span>
                      </span>
                      <span className="ml-auto pl-2 text-[17px] text-line">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

function Switch({
  value,
  onChange,
}: {
  value: GroupBy;
  onChange: (value: GroupBy) => void;
}) {
  const options: readonly { key: GroupBy; label: string }[] = [
    { key: "dish_type", label: "品種" },
    { key: "category", label: "和洋中" },
  ];

  return (
    <div className="flex rounded-[9px] border border-line bg-card p-[3px]">
      {options.map((option) => (
        <button
          aria-pressed={value === option.key}
          className={`min-h-[34px] rounded-[7px] px-3 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai ${
            value === option.key
              ? "bg-ai-soft font-medium text-ai"
              : "text-ink-3"
          }`}
          key={option.key}
          onClick={() => onChange(option.key)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
