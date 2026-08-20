"use client";

import { useState } from "react";

import {
  CATEGORY_LABEL_LONG,
  DISH_TYPE_LABEL,
  FOOD_GROUP_LABEL,
  METHOD_LABEL,
  PROTEIN_LABEL,
  SHOP_CATEGORY_LABEL,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import {
  SHOP_CATEGORY_ORDER,
  type CookMethod,
  type DishType,
  type MainProtein,
  type RecipeCategory,
  type ShopCategory,
} from "@/lib/supabase/types";

/* レシピの手動登録（仕様書 6章 の「手動作成」に対応する画面）。

   AI 生成を使わない構成では、これがレシピを増やす唯一の手段になる。
   スマートフォンでの入力を想定し、選択式を主にして打鍵を減らす。 */

type IngredientDraft = {
  name: string;
  qty: string;
  unit: string;
  shop_category: ShopCategory;
};

const emptyIngredient = (): IngredientDraft => ({
  name: "",
  qty: "",
  unit: "",
  shop_category: "produce",
});

const labelClass =
  "mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-ink-3";
const fieldClass =
  "w-full rounded-[10px] border border-line bg-card px-[13px] py-2.5 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

export function RecipeForm({
  householdId,
  onSaved,
}: {
  householdId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dishType, setDishType] = useState<DishType>("main");
  const [category, setCategory] = useState<RecipeCategory>("washoku");
  const [protein, setProtein] = useState<MainProtein>("meat");
  const [method, setMethod] = useState<CookMethod>("grill");
  const [cookTime, setCookTime] = useState("20");
  const [foodGroups, setFoodGroups] = useState<number[]>([1]);
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([
    emptyIngredient(),
  ]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [memo, setMemo] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  function toggleGroup(group: number) {
    setFoodGroups((current) =>
      current.includes(group)
        ? current.filter((g) => g !== group)
        : [...current, group].sort((a, b) => a - b),
    );
  }

  function updateIngredient(index: number, patch: Partial<IngredientDraft>) {
    setIngredients((current) =>
      current.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)),
    );
  }

  function reset() {
    setName("");
    setCookTime("20");
    setFoodGroups([1]);
    setIngredients([emptyIngredient()]);
    setSteps([""]);
    setMemo("");
  }

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage("料理名を入力してください");
      return;
    }
    const minutes = Number(cookTime);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      setMessage("調理時間は分単位の数字で入力してください");
      return;
    }

    setPending(true);
    setMessage("");
    const supabase = createClient();

    const { data: inserted, error } = await supabase
      .from("recipes")
      .insert({
        household_id: householdId,
        name: trimmedName,
        category,
        dish_type: dishType,
        main_protein: protein,
        method,
        cook_time_min: minutes,
        servings: 2,
        food_groups: foodGroups,
        tags: [],
        steps: steps.map((s) => s.trim()).filter((s) => s.length > 0),
        memo: memo.trim() || null,
        source: "manual",
        /* 人が書いたものなので承認は要らない。draft の縛りは
           AI 生成にのみ課される（仕様書 2.2-6）。 */
        status: "active",
      })
      .select("id")
      .single();

    if (error || !inserted) {
      setPending(false);
      setMessage("保存できませんでした。時間を置いてもう一度試してください。");
      return;
    }

    const rows = ingredients
      .map((ing, index) => ({ ing, index }))
      .filter(({ ing }) => ing.name.trim().length > 0)
      .map(({ ing, index }) => ({
        recipe_id: inserted.id,
        name: ing.name.trim(),
        qty: ing.qty.trim() === "" ? null : Number(ing.qty),
        unit: ing.unit.trim() || null,
        shop_category: ing.shop_category,
        sort_order: index,
      }));

    if (rows.length > 0) {
      const { error: ingredientError } = await supabase
        .from("recipe_ingredients")
        .insert(rows);

      if (ingredientError) {
        /* 材料が入らないと買い物リストが作れない。中途半端に残さない。 */
        await supabase.from("recipes").delete().eq("id", inserted.id);
        setPending(false);
        setMessage("材料を保存できませんでした。入力を確かめてください。");
        return;
      }
    }

    setPending(false);
    reset();
    setOpen(false);
    onSaved();
  }

  if (!open) {
    return (
      <button
        className="w-full rounded-[11px] bg-ai py-3 text-[13.5px] font-medium tracking-[0.03em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        onClick={() => setOpen(true)}
        type="button"
      >
        レシピを登録する
      </button>
    );
  }

  return (
    <section className="rounded-card border border-line bg-card p-4">
      <h2 className="font-mincho text-[17px] font-bold">レシピを登録する</h2>

      <div className="mt-4">
        <label className={labelClass} htmlFor="rf-name">
          料理名
        </label>
        <input
          className={fieldClass}
          id="rf-name"
          onChange={(e) => setName(e.target.value)}
          placeholder="鶏の照り焼き"
          value={name}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Select
          id="rf-dish"
          label="品種"
          onChange={(v) => setDishType(v as DishType)}
          options={Object.entries(DISH_TYPE_LABEL)}
          value={dishType}
        />
        <Select
          id="rf-cat"
          label="カテゴリ"
          onChange={(v) => setCategory(v as RecipeCategory)}
          options={Object.entries(CATEGORY_LABEL_LONG)}
          value={category}
        />
        <Select
          id="rf-protein"
          label="たんぱく源"
          onChange={(v) => setProtein(v as MainProtein)}
          options={Object.entries(PROTEIN_LABEL)}
          value={protein}
        />
        <Select
          id="rf-method"
          label="調理法"
          onChange={(v) => setMethod(v as CookMethod)}
          options={Object.entries(METHOD_LABEL)}
          value={method}
        />
      </div>

      <div className="mt-3">
        <label className={labelClass} htmlFor="rf-time">
          調理時間（分）
        </label>
        <input
          className={fieldClass}
          id="rf-time"
          inputMode="numeric"
          onChange={(e) => setCookTime(e.target.value)}
          value={cookTime}
        />
      </div>

      <fieldset className="mt-4">
        <legend className={labelClass}>食品群（該当するものすべて）</legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((group) => (
            <button
              aria-pressed={foodGroups.includes(group)}
              className={`rounded-[20px] border px-3 py-1.5 text-[12px] ${
                foodGroups.includes(group)
                  ? "border-ai bg-ai text-white"
                  : "border-line bg-card text-ink-2"
              }`}
              key={group}
              onClick={() => toggleGroup(group)}
              type="button"
            >
              {FOOD_GROUP_LABEL[group]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <p className={labelClass}>材料</p>
        {ingredients.map((ing, index) => (
          <div className="mb-2 grid grid-cols-12 gap-1.5" key={index}>
            <input
              aria-label={`材料${index + 1}の名前`}
              className={`${fieldClass} col-span-5`}
              onChange={(e) => updateIngredient(index, { name: e.target.value })}
              placeholder="鶏もも肉"
              value={ing.name}
            />
            <input
              aria-label={`材料${index + 1}の分量`}
              className={`${fieldClass} col-span-2`}
              inputMode="decimal"
              onChange={(e) => updateIngredient(index, { qty: e.target.value })}
              placeholder="300"
              value={ing.qty}
            />
            <input
              aria-label={`材料${index + 1}の単位`}
              className={`${fieldClass} col-span-2`}
              onChange={(e) => updateIngredient(index, { unit: e.target.value })}
              placeholder="g"
              value={ing.unit}
            />
            <select
              aria-label={`材料${index + 1}の売り場`}
              className={`${fieldClass} col-span-3`}
              onChange={(e) =>
                updateIngredient(index, {
                  shop_category: e.target.value as ShopCategory,
                })
              }
              value={ing.shop_category}
            >
              {SHOP_CATEGORY_ORDER.map((sc) => (
                <option key={sc} value={sc}>
                  {SHOP_CATEGORY_LABEL[sc]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          className="text-[12.5px] text-ai underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => setIngredients((c) => [...c, emptyIngredient()])}
          type="button"
        >
          材料を追加
        </button>
      </div>

      <div className="mt-4">
        <p className={labelClass}>手順</p>
        {steps.map((step, index) => (
          <div className="mb-2 flex gap-2" key={index}>
            <span className="pt-3 font-mono text-[11px] text-ai">
              {String(index + 1).padStart(2, "0")}
            </span>
            <textarea
              aria-label={`手順${index + 1}`}
              className={`${fieldClass} resize-none`}
              onChange={(e) =>
                setSteps((c) =>
                  c.map((s, i) => (i === index ? e.target.value : s)),
                )
              }
              rows={2}
              value={step}
            />
          </div>
        ))}
        <button
          className="text-[12.5px] text-ai underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => setSteps((c) => [...c, ""])}
          type="button"
        >
          手順を追加
        </button>
      </div>

      <div className="mt-4">
        <label className={labelClass} htmlFor="rf-memo">
          調理メモ
        </label>
        <textarea
          className={`${fieldClass} resize-none`}
          id="rf-memo"
          onChange={(e) => setMemo(e.target.value)}
          rows={2}
          value={memo}
        />
      </div>

      {message ? (
        <p className="mt-3 text-[12.5px] text-meat" role="alert">
          {message}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        <button
          className="flex-1 rounded-[9px] border border-line py-2.5 text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => setOpen(false)}
          type="button"
        >
          やめる
        </button>
        <button
          className="flex-1 rounded-[9px] bg-ai py-2.5 text-[12.5px] font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          disabled={pending}
          onClick={save}
          type="button"
        >
          {pending ? "保存しています" : "この内容で登録"}
        </button>
      </div>
    </section>
  );
}

function Select({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <select
        className={fieldClass}
        id={id}
        onChange={(e) => onChange(e.target.value)}
        value={value}
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
