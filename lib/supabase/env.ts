/* Supabase の接続情報を読む唯一の入口。
   `!` や `as` で型を握りつぶさず（仕様書 2.2-10）、
   未設定なら何をすればよいか分かる形で失敗させる。

   ここで読むのは ANON KEY のみ。SERVICE ROLE KEY は
   アプリコードから参照しない（仕様書 2.2-3 / 4.2）。 */
export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export function requireSupabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase の接続情報が設定されていません。" +
        ".env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。",
    );
  }

  return { url, anonKey };
}
