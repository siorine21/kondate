import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { jsonError, requireSession } from "@/lib/api/session";

/* PUT /api/recipes/[id]/rating — ★評価（1〜3）

   評価は利用者ごとに1件。献立生成のスコアに反映される（仕様書 7.2）。
   夫婦2人の平均を取るため、上書きは自分の行のみに限る。 */

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  score: z.number().int().min(1).max(3),
});

export async function PUT(request: NextRequest, { params }: Params) {
  const result = await requireSession();
  if (!result.ok) return result.response;
  const { supabase, userId } = result.session;

  const { id } = await params;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return jsonError("評価は1〜3で指定してください", 400);
  }

  /* レシピの存在は RLS が担保する。自世帯にないレシピなら
     recipe_ratings のポリシー（recipes 経由）が挿入を弾く。 */
  const { data, error } = await supabase
    .from("recipe_ratings")
    .upsert(
      {
        recipe_id: id,
        user_id: userId,
        score: body.data.score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "recipe_id,user_id" },
    )
    .select("recipe_id, score")
    .maybeSingle();

  if (error) return jsonError("評価を保存できませんでした", 500);
  if (!data) return jsonError("レシピが見つかりません", 404);

  return NextResponse.json({ rating: data });
}
