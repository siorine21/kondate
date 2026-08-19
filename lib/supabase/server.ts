import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./types";

import { requireSupabaseEnv } from "./env";

/* Server Component / Route Handler 用の Supabase クライアント。
   リクエストごとに生成する。モジュールスコープで使い回さないこと。 */
export async function createClient() {
  /* cookies() を先に呼ぶ。これでこのリクエストが動的だと Next.js が判断し、
     ビルド時の事前描画の対象から外れる。

     順序を逆にすると、環境変数が未設定の環境（Vercel の初回デプロイなど）で
     事前描画中に例外が飛び、原因の分かりにくいビルド失敗になる。 */
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からは Cookie を書き込めない。
          // セッションの更新はミドルウェアが行うため、ここでは無視してよい。
        }
      },
    },
  });
}
