import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, requireSession } from "@/lib/api/session";

/* GET   /api/recipes/[id] — 詳細（材料・手順・評価つき）
   PATCH /api/recipes/[id] — 編集 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const result = await requireSession();
  if (!result.ok) return result.response;
  const { supabase } = result.session;

  const { id } = await params;

  const { data: recipe, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return jsonError("レシピを取得できませんでした", 500);
  if (!recipe) return jsonError("レシピが見つかりません", 404);

  const { data: ingredients } = await supabase
    .from("recipe_ingredients")
    .select("id, name, qty, unit, shop_category, sort_order")
    .eq("recipe_id", id)
    .order("sort_order");

  const { data: ratings } = await supabase
    .from("recipe_ratings")
    .select("user_id, score")
    .eq("recipe_id", id);

  return NextResponse.json({
    recipe,
    ingredients: ingredients ?? [],
    ratings: ratings ?? [],
  });
}

const ingredientSchema = z.object({
  name: z.string().trim().min(1),
  qty: z.number().nullable().optional(),
  unit: z.string().trim().nullable().optional(),
  shop_category: z.enum([
    "produce",
    "meat",
    "seafood",
    "tofu",
    "dairy_egg",
    "dry",
    "seasoning",
    "other",
  ]),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  category: z.enum(["washoku", "yoshoku", "chuka", "other"]).optional(),
  dish_type: z.enum(["main", "side", "soup", "rice"]).optional(),
  main_protein: z.enum(["meat", "fish", "egg", "soy", "none"]).optional(),
  method: z
    .enum(["grill", "simmer", "fry", "stirfry", "steam", "raw", "other"])
    .optional(),
  cook_time_min: z.number().int().positive().max(240).optional(),
  servings: z.number().int().positive().max(12).optional(),
  food_groups: z.array(z.number().int().min(1).max(6)).optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(z.string().min(1)).optional(),
  memo: z.string().nullable().optional(),
  /* 材料は差分ではなく全置換。部分更新にすると sort_order が壊れる。 */
  ingredients: z.array(ingredientSchema).optional(),
});

export async function PATCH(request: NextRequest, { params }: Params) {
  const result = await requireSession();
  if (!result.ok) return result.response;
  const { supabase } = result.session;

  const { id } = await params;

  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError("入力の内容を確認してください", 400, {
      detail: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }

  const { ingredients, ...fields } = body.data;

  if (Object.keys(fields).length > 0 || ingredients) {
    const { data, error } = await supabase
      .from("recipes")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) return jsonError("レシピを更新できませんでした", 500);
    if (!data) return jsonError("レシピが見つかりません", 404);
  }

  if (ingredients) {
    await supabase.from("recipe_ingredients").delete().eq("recipe_id", id);

    if (ingredients.length > 0) {
      const { error } = await supabase.from("recipe_ingredients").insert(
        ingredients.map((ing, index) => ({
          recipe_id: id,
          name: ing.name,
          qty: ing.qty ?? null,
          unit: ing.unit ?? null,
          shop_category: ing.shop_category,
          sort_order: index,
        })),
      );
      if (error) return jsonError("材料を更新できませんでした", 500);
    }
  }

  return NextResponse.json({ id });
}
