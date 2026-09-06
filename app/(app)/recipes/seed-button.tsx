"use client";

import { useState } from "react";

import { SEED_RECIPE_NAMES } from "@/lib/seed-names";
import type { SeedRecipe } from "@/lib/seed";
import { createClient } from "@/lib/supabase/client";

/* はじめの20品を読み込む（仕様書 11.1）。

   仕様書は scripts/seed-recipes.ts で投入する想定だったが、この構成では
   サーバも実行環境も無い。ログイン中の画面から入れるのが唯一の経路になる。

   20品が一度そろえば、そのあと「もう作らない」に外しても出てこない。
   外したのは選んだ結果なので、また入れませんかと訊く筋合いがない。 */

export function SeedButton({
  householdId,
  existingNames,
  onSeeded,
}: {
  householdId: string;
  /* 状態を問わない品名。「もう作らない」にした品も含める。
     含めないと、外した品を「まだ登録していない」と数えてしまい、
     押しても何も入らないボタンが残り続ける（変更記録 3.30）。 */
  existingNames: readonly string[];
  onSeeded: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const missingNames = SEED_RECIPE_NAMES.filter(
    (name) => !existingNames.includes(name),
  );

  if (missingNames.length === 0) return null;

  async function load() {
    setPending(true);
    setError("");

    /* 材料と手順を含む本体はここで初めて読み込む。
       押さない人には配らない（レシピ画面が 20KB 以上軽くなる）。 */
    const { SEED_RECIPES } = await import("@/lib/seed");
    const missing: SeedRecipe[] = SEED_RECIPES.filter((recipe) =>
      missingNames.includes(recipe.name),
    );

    const supabase = createClient();

    /* 一覧は active しか読んでいない。「もう作らない」にした品を
       二重に入れないよう、状態を問わず品名を引き直す。 */
    const { data: known, error: knownError } = await supabase
      .from("recipes")
      .select("name");

    if (knownError || !known) {
      setPending(false);
      setError("読み込めませんでした。時間を置いてもう一度試してください。");
      return;
    }

    const knownNames = new Set(known.map((row) => row.name));
    const target = missing.filter((recipe) => !knownNames.has(recipe.name));

    if (target.length === 0) {
      setPending(false);
      onSeeded();
      return;
    }

    /* 1) レシピ本体。まとめて入れて id を受け取る。 */
    const { data: inserted, error: recipeError } = await supabase
      .from("recipes")
      .insert(
        target.map((recipe) => ({
          household_id: householdId,
          name: recipe.name,
          category: recipe.category,
          dish_type: recipe.dish_type,
          main_protein: recipe.main_protein,
          method: recipe.method,
          cook_time_min: recipe.cook_time_min,
          servings: recipe.servings,
          food_groups: recipe.food_groups,
          tags: recipe.tags,
          steps: recipe.steps,
          source: "manual" as const,
          status: "active" as const,
        })),
      )
      .select("id, name");

    if (recipeError || !inserted) {
      setPending(false);
      setError("読み込めませんでした。時間を置いてもう一度試してください。");
      return;
    }

    /* 2) 材料。名前で id を引き当てる。 */
    const idByName = new Map(inserted.map((row) => [row.name, row.id]));
    const ingredients = target.flatMap((recipe) => {
      const recipeId = idByName.get(recipe.name);
      if (!recipeId) return [];
      return recipe.ingredients.map((ing) => ({
        recipe_id: recipeId,
        name: ing.name,
        qty: ing.qty,
        unit: ing.unit,
        shop_category: ing.shop_category,
        sort_order: ing.sort_order,
      }));
    });

    const { error: ingredientError } = await supabase
      .from("recipe_ingredients")
      .insert(ingredients);

    if (ingredientError) {
      /* 材料の無いレシピを残さない。買い物リストが組めなくなるため。 */
      await supabase
        .from("recipes")
        .delete()
        .in(
          "id",
          inserted.map((row) => row.id),
        );
      setPending(false);
      setError("材料を保存できませんでした。もう一度試してください。");
      return;
    }

    /* 3) 食材マスタ（仕様書 11.2）。調味料は常備品として買い物リストに出さない。 */
    const master = new Map<
      string,
      {
        household_id: string;
        name: string;
        shop_category: SeedRecipe["ingredients"][number]["shop_category"];
        default_unit: string | null;
        is_pantry: boolean;
      }
    >();
    for (const recipe of SEED_RECIPES) {
      for (const ing of recipe.ingredients) {
        if (master.has(ing.name)) continue;
        master.set(ing.name, {
          household_id: householdId,
          name: ing.name,
          shop_category: ing.shop_category,
          default_unit: ing.unit,
          is_pantry: ing.shop_category === "seasoning",
        });
      }
    }
    await supabase
      .from("ingredient_master")
      .upsert([...master.values()], {
        onConflict: "household_id,name",
        ignoreDuplicates: true,
      });

    setPending(false);
    onSeeded();
  }

  return (
    <section className="mt-4 rounded-card border border-line bg-card p-4">
      <p className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
        はじめの{missingNames.length}品
      </p>
      <p className="mt-2 text-[12.5px] leading-[1.9] text-ink-2">
        主菜12・副菜5・汁物3をまとめて登録します。
        <br />
        献立を組むのに必要な数がこれで揃います。
      </p>
      <button
        className="mt-3 w-full rounded-[11px] bg-ai py-3 text-[13.5px] font-medium tracking-[0.03em] text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
        disabled={pending}
        onClick={load}
        type="button"
      >
        {pending ? "読み込んでいます" : `${missingNames.length}品を読み込む`}
      </button>
      {error ? (
        <p className="mt-2 text-[12px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
