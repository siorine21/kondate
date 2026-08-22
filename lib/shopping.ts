import { SHOP_CATEGORY_ORDER } from "./shop-order.ts";
import type { ShopCategory } from "@/lib/supabase/types";

/* 買い物リストの組み立て（仕様書 9章）。

   純粋関数。Supabase を import しない。確定した献立と食材マスタを渡すと、
   売り場順に並んだ買うものが返る。 */

export type SourceIngredient = {
  name: string;
  qty: number | null;
  unit: string | null;
  shopCategory: ShopCategory;
};

export type SourceRecipe = {
  id: string;
  servings: number;
  ingredients: readonly SourceIngredient[];
};

export type MasterEntry = {
  name: string;
  aliases: readonly string[];
  isPantry: boolean;
};

export type ShoppingItem = {
  name: string;
  totalQty: number | null;
  unit: string | null;
  shopCategory: ShopCategory;
  sortOrder: number;
};

export function buildShoppingList(input: {
  /* 確定した献立に出てくるレシピID。同じものが複数回出たらその回数だけ並べる。 */
  usedRecipeIds: readonly string[];
  recipes: readonly SourceRecipe[];
  master: readonly MasterEntry[];
  householdServings: number;
  includeSeasoning: boolean;
}): ShoppingItem[] {
  const {
    usedRecipeIds,
    recipes,
    master,
    householdServings,
    includeSeasoning,
  } = input;

  /* 表記ゆれの名寄せ。ingredient_master の別名を正規の名前に寄せる。 */
  const canonical = new Map<string, string>();
  const pantry = new Set<string>();
  for (const entry of master) {
    canonical.set(entry.name, entry.name);
    for (const alias of entry.aliases) canonical.set(alias, entry.name);
    if (entry.isPantry) pantry.add(entry.name);
  }
  const resolve = (name: string) => canonical.get(name) ?? name;

  /* 同じ食材でも単位が違えば別の行にする（9章）。 */
  type Bucket = {
    name: string;
    unit: string | null;
    shopCategory: ShopCategory;
    total: number | null;
  };
  const buckets = new Map<string, Bucket>();

  for (const recipeId of usedRecipeIds) {
    const recipe = recipes.find((item) => item.id === recipeId);
    if (!recipe) continue;

    const scale = recipe.servings > 0 ? householdServings / recipe.servings : 1;

    for (const ingredient of recipe.ingredients) {
      const name = resolve(ingredient.name);

      /* 常備品は買い物リストに出さない（11.2）。 */
      if (pantry.has(name)) continue;
      /* 設定で調味料を出さないなら外す（3.2 include_seasoning_in_shopping）。 */
      if (!includeSeasoning && ingredient.shopCategory === "seasoning") continue;

      const key = `${name} ${ingredient.unit ?? ""}`;
      const bucket = buckets.get(key) ?? {
        name,
        unit: ingredient.unit,
        shopCategory: ingredient.shopCategory,
        total: null,
      };

      if (ingredient.qty !== null) {
        bucket.total = (bucket.total ?? 0) + ingredient.qty * scale;
      }
      buckets.set(key, bucket);
    }
  }

  const order = (category: ShopCategory) => {
    const index = SHOP_CATEGORY_ORDER.indexOf(category);
    return index < 0 ? SHOP_CATEGORY_ORDER.length : index;
  };

  return [...buckets.values()]
    .sort(
      (a, b) =>
        order(a.shopCategory) - order(b.shopCategory) ||
        a.name.localeCompare(b.name, "ja"),
    )
    .map((bucket, index) => ({
      name: bucket.name,
      totalQty:
        bucket.total === null ? null : Math.round(bucket.total * 100) / 100,
      unit: bucket.unit,
      shopCategory: bucket.shopCategory,
      sortOrder: index,
    }));
}
