/* 「もどる」の行き先（仕様書 5.4 / 変更記録 3.37）。

   買い物リスト・栄養サマリ・レシピ詳細は、行き方が2つ以上ある。
   もどる先を1つに決め打つと、必ずどちらかで遠回りになる。

   仕様書 5.4 は「戻る操作は遷移元へ返す（ブラウザバックに依存せず、
   遷移元を保持する）」と書いている。ブラウザの履歴に頼らず、
   リンクに ?from= を付けて遷移元を持ち回る。

   純粋関数。React も Supabase も import しない（仕様書 2.3）。 */

export type Origin = "today" | "week" | "recipes";

/* 遷移元の画面と、そこへ戻るときに出す言葉。
   言葉は各画面の見出しと揃える（仕様書 5.5「同じものは同じ言葉で呼ぶ」）。 */
export const ORIGIN: Record<Origin, { href: string; label: string }> = {
  today: { href: "/", label: "今日の献立" },
  week: { href: "/week/", label: "週間献立" },
  recipes: { href: "/recipes/", label: "レシピ" },
};

/* `in` は prototype まで見に行くので "constructor" が通ってしまう。
   自分の持ち物だけを見る。 */
const isOrigin = (value: string): value is Origin =>
  Object.hasOwn(ORIGIN, value);

/* もどる先。?from= が無い・読めないときは、その画面の既定の親へ返す。
   直接ひらいたときや、古いブックマークから来たときがこれにあたる。 */
export function backTo(from: string | null, fallback: Origin) {
  return ORIGIN[from !== null && isOrigin(from) ? from : fallback];
}

/* 遷移元を付けたリンク。既定の親から出るリンクには付けない
   （付けても同じ所へ戻るので、URL を長くするだけ）。 */
export function withOrigin(href: string, from: Origin): string {
  return `${href}${href.includes("?") ? "&" : "?"}from=${from}`;
}
