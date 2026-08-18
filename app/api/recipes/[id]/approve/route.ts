import { NextResponse } from "next/server";

import { jsonError, requireSession } from "@/lib/api/session";

/* POST /api/recipes/[id]/approve — draft → active

   ここが「AI の分量ミスを人が止める」工程（仕様書 2.2-6 / 8.4）。
   承認を経ていないレシピは献立に使われない。 */

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const result = await requireSession();
  if (!result.ok) return result.response;
  const { supabase } = result.session;

  const { id } = await params;

  /* draft のものだけを active にする。
     条件に status を入れることで、既に archived になったものを
     取り違えて復活させることがない。 */
  const { data, error } = await supabase
    .from("recipes")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "draft")
    .select("id, name, status")
    .maybeSingle();

  if (error) return jsonError("承認できませんでした", 500);
  if (!data) {
    return jsonError("承認待ちのレシピが見つかりません", 404);
  }

  return NextResponse.json({ recipe: data });
}
