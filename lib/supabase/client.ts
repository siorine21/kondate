import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "./env";

/* ブラウザ（Client Component）用の Supabase クライアント。
   ANON KEY はここで露出する前提。データの遮断は RLS が担う（仕様書 3.3）。

   献立生成ロジックはこのクライアント経由で実行しない（仕様書 2.2-8）。 */
export function createClient() {
  const { url, anonKey } = requireSupabaseEnv();

  return createBrowserClient(url, anonKey);
}
