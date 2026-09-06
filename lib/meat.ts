/* 肉の種類を材料名から見分ける（変更記録 3.33）。

   main_protein は肉・魚・卵・大豆までしか分けない。同じ「肉」でも
   鶏が3日続けば食卓は単調になるので、鶏・豚・牛を分けて見る。

   列は増やさない。食品群（3.21）や売り場（3.22）と同じく材料名から出す。
   スキーマも変わらず、登録済みのレシピにもそのまま効く。

   純粋関数。Supabase を import しない（仕様書 2.3）。 */

export type MeatKind = "chicken" | "pork" | "beef" | "mixed" | "other";

export const MEAT_LABEL: Record<MeatKind, string> = {
  chicken: "鶏",
  pork: "豚",
  beef: "牛",
  mixed: "合いびき",
  other: "その他の肉",
};

export const MEAT_ORDER: readonly MeatKind[] = [
  "chicken",
  "pork",
  "beef",
  "mixed",
  "other",
];

/* 語を含んでいたらその種類。上から順に見て、最初に当たったものを採る。
   並び順が意味を持つ。「牛乳」は「牛」より、「合いびき」は「豚」「牛」より
   先に置く。 */
const HINTS: readonly (readonly [string, MeatKind | null])[] = [
  /* 肉ではないもの。先に外す。 */
  ["牛乳", null],
  ["牛脂", null],

  /* 2種類の肉が混ざったもの。豚・牛より先に見る。 */
  ["合いびき", "mixed"],
  ["合い挽き", "mixed"],
  ["合挽", "mixed"],

  ["鶏", "chicken"],
  ["とり肉", "chicken"],
  ["ささみ", "chicken"],
  ["手羽", "chicken"],

  ["豚", "pork"],
  ["ポーク", "pork"],
  ["ベーコン", "pork"],
  ["ハム", "pork"],
  ["ソーセージ", "pork"],
  ["ウインナー", "pork"],

  ["牛", "beef"],
  ["ビーフ", "beef"],

  ["ラム", "other"],
  ["羊", "other"],
  ["鴨", "other"],
  ["ジンギスカン", "other"],
];

/* 材料ひとつを見る。肉でなければ null。 */
export function meatOf(name: string): MeatKind | null {
  const key = name.trim();
  if (key === "") return null;
  const hit = HINTS.find(([word]) => key.includes(word));
  return hit ? hit[1] : null;
}

/* レシピの肉の種類。材料の並び順に見て、最初に当たったものを採る。
   主菜は主役の肉を先に書くのが普通なので、それを主役とみなす。
   肉が入っていなければ null。 */
export function meatKindOf(
  ingredientNames: readonly string[],
): MeatKind | null {
  for (const name of ingredientNames) {
    const kind = meatOf(name);
    if (kind !== null) return kind;
  }
  return null;
}
