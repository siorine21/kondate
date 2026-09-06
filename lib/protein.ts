import { groupOf } from "./food-groups.ts";
import type { MainProtein } from "./supabase/types";

/* 材料に含まれるたんぱく源（変更記録 3.34）。

   main_protein は1つしか選べないが、実際には
   「厚揚げと豚肉の味噌炒め」のように2つ以上を使う料理が多い。
   主役は main_protein のまま置き、含まれているものは材料名から出す。

   調味料かどうかの判断は food-groups.ts に任せる。
   1群（魚肉卵豆）と判定されたものだけを、さらに肉・魚・卵・大豆に分ける。
   同じ判断を2箇所に書くと、片方だけ直す事故が起きる。

     鶏がらスープの素 → 1群ではないので、肉として数えない
     醤油・味噌       → 1群ではないので、大豆として数えない
     かつお節         → 2群なので、魚として数えない

   純粋関数。Supabase を import しない（仕様書 2.3）。 */

/* 1群の中での分け方。上から順に見て、最初に当たったものを採る。
   並び順が意味を持つ。「かつお」より「かつお節」を先に外すのは
   food-groups の仕事なので、ここには書かない。 */
const KINDS: readonly (readonly [string, MainProtein])[] = [
  ["卵", "egg"],
  ["たまご", "egg"],

  ["豆腐", "soy"],
  ["厚揚げ", "soy"],
  ["油揚げ", "soy"],
  ["納豆", "soy"],
  ["高野豆腐", "soy"],
  ["がんもどき", "soy"],
  ["おから", "soy"],
  ["大豆", "soy"],
  ["きな粉", "soy"],

  ["ひき肉", "meat"],
  ["挽き肉", "meat"],
  ["肉", "meat"],
  ["ハム", "meat"],
  ["ベーコン", "meat"],
  ["ソーセージ", "meat"],
  ["ウインナー", "meat"],
  ["ささみ", "meat"],
  ["手羽", "meat"],

  /* 練物は魚だが、たんぱく源としては控えめ。1群なので魚に寄せる。 */
  ["ちくわ", "fish"],
  ["はんぺん", "fish"],
  ["さつま揚げ", "fish"],
  ["かまぼこ", "fish"],
];

/* 材料ひとつのたんぱく源。1群でなければ null。 */
export function proteinOf(name: string): MainProtein | null {
  /* まず調味料かどうかを food-groups に訊く。1群でなければ数えない。 */
  if (groupOf(name) !== 1) return null;

  const key = name.trim();
  const hit = KINDS.find(([word]) => key.includes(word));
  if (hit) return hit[1];

  /* 1群だがここに無いものは魚。food-groups の1群は
     魚・肉・卵・大豆で、上で肉・卵・大豆を拾い切っている。 */
  return "fish";
}

/* レシピに含まれるたんぱく源。重複は1つにまとめる。 */
export function proteinSourcesOf(
  ingredientNames: readonly string[],
): MainProtein[] {
  const found = new Set<MainProtein>();
  for (const name of ingredientNames) {
    const kind = proteinOf(name);
    if (kind !== null) found.add(kind);
  }
  return [...found];
}
