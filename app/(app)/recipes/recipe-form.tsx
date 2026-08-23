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

/* レシピの手動登録と編集（仕様書 6章「手動作成」「編集」/ 5.2-4）。

   AI 生成を使わない構成では、これがレシピを増やす唯一の手段になる。
   スマートフォンでの入力を想定し、選択式を主にして打鍵を減らす。

   initial を渡すと編集になる。渡さなければ新規登録。
   入力欄は同じなので、画面を2つに分けずに1つで扱う。 */

export type IngredientDraft = {
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

export type RecipeDraft = {
  id: string;
  name: string;
  category: RecipeCategory;
  dish_type: DishType;
  main_protein: MainProtein;
  method: CookMethod;
  cook_time_min: number;
  food_groups: number[];
  steps: string[];
  memo: string | null;
  ingredients: IngredientDraft[];
};

const labelClass =
  "mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-ink-3";
const fieldClass =
  "w-full rounded-[10px] border border-line bg-card px-[13px] py-2.5 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

export function RecipeForm({
  householdId,
  initial,
  onSaved,
  onCancel,
}: {
  householdId: string;
  /* 渡すと編集になる。 */
  initial?: RecipeDraft;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const editing = initial !== undefined;
  const [open, setOpen] = useState(editing);
  const [name, setName] = useState(initial?.name ?? "");
  const [dishType, setDishType] = useState<DishType>(
    initial?.dish_type ?? "main",
  );
  const [category, setCategory] = useState<RecipeCategory>(
    initial?.category ?? "washoku",
  );
  const [protein, setProtein] = useState<MainProtein>(
    initial?.main_protein ?? "meat",
  );
  const [method, setMethod] = useState<CookMethod>(initial?.method ?? "grill");
  const [cookTime, setCookTime] = useState(
    String(initial?.cook_time_min ?? 20),
  );
  const [foodGroups, setFoodGroups] = useState<number[]>(
    initial?.food_groups ?? [1],
  );
  const [ingredients, setIngredients] = useState<IngredientDraft[]>(
    initial && initial.ingredients.length > 0
      ? initial.ingredients
      : [emptyIngredient()],
  );
  const [steps, setSteps] = useState<string[]>(
    initial && initial.steps.length > 0 ? initial.steps : [""],
  );
  const [memo, setMemo] = useState(initial?.memo ?? "");
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

    const fields = {
      name: trimmedName,
      category,
      dish_type: dishType,
      main_protein: protein,
      method,
      cook_time_min: minutes,
      food_groups: foodGroups,
      steps: steps.map((s) => s.trim()).filter((s) => s.length > 0),
      memo: memo.trim() || null,
    };

    const ingredientRows = (recipeId: string) =>
      ingredients
        .map((ing, index) => ({ ing, index }))
        .filter(({ ing }) => ing.name.trim().length > 0)
        .map(({ ing, index }) => ({
          recipe_id: recipeId,
          name: ing.name.trim(),
          qty: ing.qty.trim() === "" ? null : Number(ing.qty),
          unit: ing.unit.trim() || null,
          shop_category: ing.shop_category,
          sort_order: index,
        }));

    if (initial) {
      const failed = await update(supabase, initial.id, fields, ingredientRows);
      setPending(false);
      if (failed) {
        setMessage(failed);
        return;
      }
      onSaved();
      return;
    }

    const { data: inserted, error } = await supabase
      .from("recipes")
      .insert({
        ...fields,
        household_id: householdId,
        servings: 2,
        tags: [],
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

    const rows = ingredientRows(inserted.id);

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
      <h2 className="font-mincho text-[17px] font-bold">
        {editing ? "レシピを編集する" : "レシピを登録する"}
      </h2>

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
        <p className="mt-3 text-[12.5px] text-danger" role="alert">
          {message}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2.5">
        <button
          className="min-h-[44px] flex-1 rounded-[9px] border border-line text-[12.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          onClick={() => {
            if (editing) {
              onCancel?.();
              return;
            }
            setOpen(false);
          }}
          type="button"
        >
          やめる
        </button>
        <button
          className="min-h-[44px] flex-1 rounded-[9px] bg-ai text-[12.5px] font-medium text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          disabled={pending}
          onClick={save}
          type="button"
        >
          {pending
          ? "保存しています"
          : editing
            ? "この内容で保存"
            : "この内容で登録"}
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

/* 編集の保存。材料は入れ替えなので、消してから入れ直す。
   途中で落ちると材料だけ消えた状態が残るため、元の行を控えてから消す。 */
async function update(
  supabase: ReturnType<typeof createClient>,
  recipeId: string,
  fields: {
    name: string;
    category: RecipeCategory;
    dish_type: DishType;
    main_protein: MainProtein;
    method: CookMethod;
    cook_time_min: number;
    food_groups: number[];
    steps: string[];
    memo: string | null;
  },
  buildRows: (recipeId: string) => {
    recipe_id: string;
    name: string;
    qty: number | null;
    unit: string | null;
    shop_category: ShopCategory;
    sort_order: number;
  }[],
): Promise<string | null> {
  const { error } = await supabase
    .from("recipes")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", recipeId);

  if (error) {
    return "保存できませんでした。時間を置いてもう一度試してください。";
  }

  const { data: previous } = await supabase
    .from("recipe_ingredients")
    .select("name, qty, unit, shop_category, sort_order")
    .eq("recipe_id", recipeId);

  const { error: deleteError } = await supabase
    .from("recipe_ingredients")
    .delete()
    .eq("recipe_id", recipeId);

  if (deleteError) {
    return "材料を保存できませんでした。時間を置いてもう一度試してください。";
  }

  const rows = buildRows(recipeId);
  if (rows.length === 0) return null;

  const { error: insertError } = await supabase
    .from("recipe_ingredients")
    .insert(rows);

  if (insertError) {
    /* 入れ直せなかったので、消す前の材料を戻す。 */
    if (previous && previous.length > 0) {
      await supabase
        .from("recipe_ingredients")
        .insert(previous.map((row) => ({ ...row, recipe_id: recipeId })));
    }
    return "材料を保存できませんでした。ほかの内容は保存済みです。材料を確かめて、もう一度保存してください。";
  }

  return null;
}
