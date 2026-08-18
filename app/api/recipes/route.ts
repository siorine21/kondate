import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, requireSession } from "@/lib/api/session";

/* GET  /api/recipes  — 一覧（status・dish_type でフィルタ）
   POST /api/recipes  — 手動作成 */

const RECIPE_COLUMNS =
  "id, name, category, dish_type, main_protein, method, cook_time_min, servings, food_groups, tags, memo, source, status, created_at";

export async function GET(request: NextRequest) {
  const result = await requireSession();
  if (!result.ok) return result.response;
  const { supabase } = result.session;

  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const dishType = params.get("dish_type");

  /* 世帯の絞り込みは書かない。RLS が行うため（仕様書 3.3）。
     ここで household_id を条件に足しても二重になるだけ。 */
  let query = supabase.from("recipes").select(RECIPE_COLUMNS);

  if (status === "draft" || status === "active" || status === "archived") {
    query = query.eq("status", status);
  }
  if (
    dishType === "main" ||
    dishType === "side" ||
    dishType === "soup" ||
    dishType === "rice"
  ) {
    query = query.eq("dish_type", dishType);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return jsonError("レシピを取得できませんでした", 500);
  return NextResponse.json({ recipes: data });
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

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.enum(["washoku", "yoshoku", "chuka", "other"]),
  dish_type: z.enum(["main", "side", "soup", "rice"]),
  main_protein: z.enum(["meat", "fish", "egg", "soy", "none"]).default("none"),
  method: z
    .enum(["grill", "simmer", "fry", "stirfry", "steam", "raw", "other"])
    .default("other"),
  cook_time_min: z.number().int().positive().max(240),
  servings: z.number().int().positive().max(12).default(2),
  food_groups: z.array(z.number().int().min(1).max(6)).default([]),
  tags: z.array(z.string()).default([]),
  steps: z.array(z.string().min(1)).default([]),
  memo: z.string().nullable().default(null),
  ingredients: z.array(ingredientSchema).default([]),
});

export async function POST(request: NextRequest) {
  const result = await requireSession();
  if (!result.ok) return result.response;
  const { supabase, householdId } = result.session;

  const body = createSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError("入力の内容を確認してください", 400, {
      detail: body.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }

  const { ingredients, ...recipe } = body.data;

  /* 手動作成は人が書いたものなので active で入れてよい。
     draft の縛りは AI 生成にのみ課される（仕様書 2.2-6）。 */
  const { data: inserted, error } = await supabase
    .from("recipes")
    .insert({
      ...recipe,
      household_id: householdId,
      source: "manual",
      status: "active",
    })
    .select("id")
    .single();

  if (error || !inserted) return jsonError("レシピを保存できませんでした", 500);

  if (ingredients.length > 0) {
    const { error: ingredientError } = await supabase
      .from("recipe_ingredients")
      .insert(
        ingredients.map((ing, index) => ({
          recipe_id: inserted.id,
          name: ing.name,
          qty: ing.qty ?? null,
          unit: ing.unit ?? null,
          shop_category: ing.shop_category,
          sort_order: index,
        })),
      );

    if (ingredientError) {
      await supabase.from("recipes").delete().eq("id", inserted.id);
      return jsonError("材料を保存できませんでした", 500);
    }
  }

  return NextResponse.json({ id: inserted.id }, { status: 201 });
}
