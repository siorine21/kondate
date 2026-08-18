import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./types";

import { requireSupabaseEnv } from "./env";

/* Server Component / Route Handler 用の Supabase クライアント。
   リクエストごとに生成する。モジュールスコープで使い回さないこと。 */
export async function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  const cookieStore = await cookies();

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
