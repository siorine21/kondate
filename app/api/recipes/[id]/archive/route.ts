import { NextResponse } from "next/server";

import { jsonError, requireSession } from "@/lib/api/session";

/* POST /api/recipes/[id]/archive — 「もう作らない」

   削除ではなくアーカイブにする。過去の献立が recipe_id を参照しているため、
   消すと履歴が壊れる。候補プールからは status で外れる（仕様書 7.2）。 */

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const result = await requireSession();
  if (!result.ok) return result.response;
  const { supabase } = result.session;

  const { id } = await params;

  const { data, error } = await supabase
    .from("recipes")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, status")
    .maybeSingle();

  if (error) return jsonError("変更できませんでした", 500);
  if (!data) return jsonError("レシピが見つかりません", 404);

  return NextResponse.json({ recipe: data });
}
