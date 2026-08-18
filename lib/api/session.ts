import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

/* 全 Route Handler の冒頭でセッションを検証する（仕様書 4.2）。
   ここを通さないルートを作らないこと。

   RLS があるので世帯外のデータは DB が弾くが、未認証を 401 で
   はっきり返すのは別の役割。無言で空配列を返すと原因が分からなくなる。 */

export type ApiSession = {
  supabase: SupabaseClient<Database>;
  userId: string;
  householdId: string;
};

export type SessionResult =
  | { ok: true; session: ApiSession }
  | { ok: false; response: NextResponse };

export function jsonError(
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function requireSession(): Promise<SessionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: jsonError("ログインが必要です", 401) };
  }

  /* 世帯 ID は挿入時に必要になる。RLS のポリシーも同じ値で判定している。 */
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: jsonError("世帯の情報を取得できませんでした", 500),
    };
  }

  if (!profile) {
    /* 認証は通ったが世帯に紐付いていない。招待済みの2名以外が
       ログインした場合にここへ来る（仕様書 4.4 の投入漏れでも起きる）。 */
    return {
      ok: false,
      response: jsonError("この利用者は世帯に登録されていません", 403),
    };
  }

  return {
    ok: true,
    session: { supabase, userId: user.id, householdId: profile.household_id },
  };
}
