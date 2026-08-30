import type { ShopCategory } from "@/lib/supabase/types";

/* 買い物メモに手で足した品を、どの売り場に置くか決める。

   売り場を選ばずに足すと全部「その他」に入ってしまい、
   店内を売り場順に回るときに探しにくくなる。品名から見当をつける。

   見当なので外れることがある。画面では初期値として出すだけで、
   足す前に手で変えられるようにしてある。 */

/* 名前に含まれていたらその売り場、という手がかり。
   上から順に見て、最初に当たったものを採る。長い語を先に置くこと。
   「牛乳」は「牛」より先に来ないと精肉になる。 */
const HINTS: readonly (readonly [string, ShopCategory])[] = [
  /* 乳・卵。「牛乳」を精肉より先に見る。 */
  ["牛乳", "dairy_egg"],
  ["豆乳", "dairy_egg"],
  ["ヨーグルト", "dairy_egg"],
  ["チーズ", "dairy_egg"],
  ["バター", "dairy_egg"],
  ["生クリーム", "dairy_egg"],
  ["卵", "dairy_egg"],
  ["たまご", "dairy_egg"],
  ["タマゴ", "dairy_egg"],

  /* 豆腐・練物。「油揚げ」を「油」より先に見る。 */
  ["豆腐", "tofu"],
  ["厚揚げ", "tofu"],
  ["油揚げ", "tofu"],
  ["納豆", "tofu"],
  ["がんもどき", "tofu"],
  ["ちくわ", "tofu"],
  ["はんぺん", "tofu"],
  ["さつま揚げ", "tofu"],
  ["かまぼこ", "tofu"],

  /* 精肉。 */
  ["ひき肉", "meat"],
  ["挽き肉", "meat"],
  ["肉", "meat"],
  ["ハム", "meat"],
  ["ベーコン", "meat"],
  ["ソーセージ", "meat"],
  ["ウインナー", "meat"],
  ["ささみ", "meat"],
  ["手羽", "meat"],

  /* 鮮魚。 */
  ["刺身", "seafood"],
  ["切り身", "seafood"],
  ["えび", "seafood"],
  ["エビ", "seafood"],
  ["いか", "seafood"],
  ["イカ", "seafood"],
  ["たこ", "seafood"],
  ["あさり", "seafood"],
  ["しじみ", "seafood"],
  ["ほたて", "seafood"],
  ["鮭", "seafood"],
  ["さば", "seafood"],
  ["ぶり", "seafood"],
  ["まぐろ", "seafood"],
  ["たら", "seafood"],
  ["あじ", "seafood"],
  ["いわし", "seafood"],
  ["さんま", "seafood"],
  ["魚", "seafood"],

  /* 調味料。レシピの材料にも使うので、粉類と香辛料まで入れてある。
     小麦粉・片栗粉を乾物ではなく調味料に置くのは、買い物リストで
     「調味料を出さない」設定（仕様書 9章）に一緒に従わせるため。
     家にあるものを毎週リストに出しても仕方がない。 */
  /* 「だし汁」は自分で取るもので買わない。「だしの素」より先に見る。 */
  ["だし汁", "other"],
  ["醤油", "seasoning"],
  ["しょうゆ", "seasoning"],
  ["味噌", "seasoning"],
  ["みそ", "seasoning"],
  ["みりん", "seasoning"],
  ["料理酒", "seasoning"],
  ["ごま油", "seasoning"],
  ["オリーブオイル", "seasoning"],
  ["サラダ油", "seasoning"],
  ["ソース", "seasoning"],
  ["ケチャップ", "seasoning"],
  ["マヨネーズ", "seasoning"],
  ["ドレッシング", "seasoning"],
  ["砂糖", "seasoning"],
  ["塩", "seasoning"],
  ["こしょう", "seasoning"],
  ["酢", "seasoning"],
  ["だし", "seasoning"],
  ["カレールー", "seasoning"], ["カレー粉", "seasoning"],
  ["酒", "seasoning"], ["ワイン", "seasoning"],
  ["豆板醤", "seasoning"], ["甜麺醤", "seasoning"], ["コチュジャン", "seasoning"],
  ["オイスターソース", "seasoning"], ["ナンプラー", "seasoning"],
  ["スープの素", "seasoning"], ["コンソメ", "seasoning"], ["ブイヨン", "seasoning"],
  ["小麦粉", "seasoning"], ["片栗粉", "seasoning"], ["パン粉", "seasoning"],
  ["天ぷら粉", "seasoning"], ["ベーキングパウダー", "seasoning"],
  ["ローリエ", "seasoning"], ["ナツメグ", "seasoning"], ["七味", "seasoning"],
  ["一味", "seasoning"], ["山椒", "seasoning"], ["クミン", "seasoning"],
  ["オレガノ", "seasoning"],
  ["揚げ油", "seasoning"], ["米油", "seasoning"], ["なたね油", "seasoning"],

  /* 乾物。 */
  /* 粉類は上の調味料で当たっているので、ここには置かない。 */
  ["わかめ", "dry"],
  ["ひじき", "dry"],
  ["昆布", "dry"],
  ["のり", "dry"],
  ["海苔", "dry"],
  ["かつお節", "dry"],
  ["切り干し", "dry"],
  ["高野豆腐", "dry"],
  ["ごま", "dry"],
  ["麩", "dry"],
  ["春雨", "dry"],
  ["米", "dry"],
  ["パスタ", "dry"],
  ["うどん", "dry"],
  ["そば", "dry"],
  ["中華麺", "dry"],
  ["缶", "dry"],

  /* 青果。 */
  ["キャベツ", "produce"],
  ["白菜", "produce"],
  ["ほうれん草", "produce"],
  ["小松菜", "produce"],
  ["ねぎ", "produce"],
  ["玉ねぎ", "produce"],
  ["にんじん", "produce"],
  ["じゃがいも", "produce"],
  ["大根", "produce"],
  ["きゅうり", "produce"],
  ["トマト", "produce"],
  ["なす", "produce"],
  ["ピーマン", "produce"],
  ["ブロッコリー", "produce"],
  ["レタス", "produce"],
  ["もやし", "produce"],
  ["きのこ", "produce"],
  ["しめじ", "produce"],
  ["えのき", "produce"],
  ["しいたけ", "produce"],
  ["かぼちゃ", "produce"],
  ["にんにく", "produce"],
  ["しょうが", "produce"],
  ["ししとう", "produce"], ["パプリカ", "produce"], ["オクラ", "produce"],
  ["いんげん", "produce"], ["アスパラ", "produce"], ["ズッキーニ", "produce"],
  ["セロリ", "produce"], ["ごぼう", "produce"], ["れんこん", "produce"],
  ["さつまいも", "produce"], ["じゃがいも", "produce"], ["里芋", "produce"],
  ["山芋", "produce"], ["長芋", "produce"], ["かぶ", "produce"],
  ["水菜", "produce"], ["春菊", "produce"], ["チンゲン菜", "produce"],
  ["にら", "produce"], ["三つ葉", "produce"], ["しそ", "produce"],
  ["大葉", "produce"], ["パセリ", "produce"], ["豆苗", "produce"],
  ["バジル", "produce"], ["クレソン", "produce"],
  ["まいたけ", "produce"], ["エリンギ", "produce"], ["マッシュルーム", "produce"],
  ["レモン", "produce"], ["ゆず", "produce"], ["すだち", "produce"],
  ["りんご", "produce"],
  ["バナナ", "produce"],
  ["みかん", "produce"],
];

/* 食材マスタに載っている名前。買い物リストの組み立てが使うのと同じ表で、
   レシピの材料から作られている（仕様書 11.2）。
   この家で実際に使う食材なので、決め打ちの手がかりより優先する。 */
export type MasterEntry = { name: string; shop_category: ShopCategory };

export function guessShopCategory(
  name: string,
  master: readonly MasterEntry[] = [],
): ShopCategory {
  const key = name.trim();
  if (key === "") return "other";

  /* まず食材マスタ。名前が一致するもの、次に名前を含むもの。 */
  const exact = master.find((row) => row.name === key);
  if (exact) return exact.shop_category;

  const partial = master.find(
    (row) => row.name !== "" && (key.includes(row.name) || row.name.includes(key)),
  );
  if (partial) return partial.shop_category;

  /* 載っていなければ手がかりから。 */
  const hit = HINTS.find(([word]) => key.includes(word));
  return hit ? hit[1] : "other";
}

/* 単位の書き方を揃える。「1 G」と「1 g」が別物に見えるのを防ぐ。
   全角で入れても半角に直す。日本語の単位（個・本・丁）はそのまま。 */
const UNIT_ALIAS: Readonly<Record<string, string>> = {
  g: "g",
  kg: "kg",
  ml: "ml",
  l: "L",
  cc: "cc",
};

export function normalizeUnit(unit: string): string {
  const trimmed = unit
    .trim()
    /* 全角英数を半角にする。ｇ → g */
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    );
  if (trimmed === "") return "";
  const alias = UNIT_ALIAS[trimmed.toLowerCase()];
  return alias ?? trimmed;
}
