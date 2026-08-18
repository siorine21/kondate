import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  type IngredientInsert,
  RecipeGenerationError,
  generateRecipe,
  toIngredientInserts,
  toRecipeInsert,
} from "@/lib/ai/recipe";
import { type ApiSession, jsonError, requireSession } from "@/lib/api/session";
import type { ShopCategory } from "@/lib/supabase/types";

/* POST /api/recipes/generate — 仕様書 8.1 / 8.4
   body: { name: string, dishType?: DishType } → draft として保存し ID を返す */

const bodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  dishType: z.enum(["main", "side", "soup", "rice"]).optional(),
});

export async function POST(request: NextRequest) {
  const result = await requireSession();
  if (!result.ok) return result.response;
  const { supabase, householdId } = result.session;

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return jsonError("品名を入力してください", 400);
  }

  /* 1〜3. 生成・整形・検証（失敗時は1回だけ再試行される） */
  let recipe;
  try {
    recipe = await generateRecipe({
      name: parsedBody.data.name,
      dishType: parsedBody.data.dishType,
    });
  } catch (error) {
    if (error instanceof RecipeGenerationError) {
      if (error.reason === "missing_api_key") {
        return jsonError("レシピ生成の設定が未完了です", 503, {
          detail: error.detail,
        });
      }
      /* 文言は仕様書 5.5 に合わせる。謝らず、次の行動を書く。 */
      return jsonError(
        "レシピを作れませんでした。品名を具体的にするか、時間を置いて試してください。",
        502,
        { detail: error.detail },
      );
    }
    throw error;
  }

  /* 4. source='ai', status='draft' で保存（2.2-6） */
  const { data: inserted, error: insertError } = await supabase
    .from("recipes")
    .insert(toRecipeInsert(recipe, householdId))
    .select("id")
    .single();

  if (insertError || !inserted) {
    return jsonError("レシピを保存できませんでした", 500);
  }

  const ingredients = toIngredientInserts(recipe, inserted.id);
  const { error: ingredientError } = await supabase
    .from("recipe_ingredients")
    .insert(ingredients);

  if (ingredientError) {
    /* 材料が入らないと買い物リストが作れない。中途半端に残さず取り消す。 */
    await supabase.from("recipes").delete().eq("id", inserted.id);
    return jsonError("材料を保存できませんでした", 500);
  }

  /* 5. 各材料名を ingredient_master と照合し、未登録なら追加する */
  await syncIngredientMaster(supabase, householdId, ingredients);

  /* 6. 生成したレシピ ID を返す */
  return NextResponse.json({ id: inserted.id, name: recipe.name }, { status: 201 });
}

async function syncIngredientMaster(
  supabase: ApiSession["supabase"],
  householdId: string,
  ingredients: IngredientInsert[],
): Promise<void> {
  /* 同じ材料が同一レシピ内に複数あっても1件にまとめる。 */
  const seen = new Map<
    string,
    { shop_category: ShopCategory; unit: string | null }
  >();
  for (const ing of ingredients) {
    if (!seen.has(ing.name)) {
      seen.set(ing.name, { shop_category: ing.shop_category, unit: ing.unit });
    }
  }

  const rows = [...seen.entries()].map(([name, meta]) => ({
    household_id: householdId,
    name,
    shop_category: meta.shop_category,
    default_unit: meta.unit,
  }));

  if (rows.length === 0) return;

  /* 既存は触らない。ユーザーが手で直した売り場分類や別名を上書きしないため。
     ここが失敗してもレシピ自体は成立するので、結果は握らない。 */
  await supabase
    .from("ingredient_master")
    .upsert(rows, { onConflict: "household_id,name", ignoreDuplicates: true });
}
