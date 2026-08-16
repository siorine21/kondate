import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { requireSupabaseEnv } from "./env";

/* 認証セッションの更新のみを行う。
   Server Component は Cookie を書き込めないため、トークンの
   リフレッシュはここで行い、更新後の Cookie をレスポンスに載せる。

   ログイン画面以外を保護するリダイレクト処理と、これを呼び出す
   ルート直下の middleware.ts は Phase 1（認証）で追加する。 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = requireSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        supabaseResponse = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() を呼ぶとトークンが検証・更新される。この呼び出しは省略しない。
  await supabase.auth.getUser();

  return supabaseResponse;
}
