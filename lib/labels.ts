import type {
  CookMethod,
  DishType,
  MainProtein,
  RecipeCategory,
  RecipeSource,
  RecipeStatus,
  ShopCategory,
} from "@/lib/supabase/types";

/* 画面に出す日本語はここに集約する。
   同じものを違う言葉で呼ばないため（仕様書 5.5）。 */

export const CATEGORY_LABEL: Record<RecipeCategory, string> = {
  washoku: "和",
  yoshoku: "洋",
  chuka: "中",
  other: "その他",
};

export const CATEGORY_LABEL_LONG: Record<RecipeCategory, string> = {
  washoku: "和食",
  yoshoku: "洋食",
  chuka: "中華",
  other: "その他",
};

export const DISH_TYPE_LABEL: Record<DishType, string> = {
  main: "主菜",
  side: "副菜",
  soup: "汁物",
  rice: "主食",
};

export const PROTEIN_LABEL: Record<MainProtein, string> = {
  meat: "肉",
  fish: "魚",
  egg: "卵",
  soy: "大豆",
  none: "—",
};

/* たんぱく源の色。週間画面のリボンと各日カードの色スパインで
   同じ配色を使う（仕様書 付録A-1 / A-2）。 */
export const PROTEIN_BG: Record<MainProtein, string> = {
  meat: "bg-meat",
  fish: "bg-fish",
  egg: "bg-egg",
  soy: "bg-soy",
  none: "bg-ink-3",
};

export const METHOD_LABEL: Record<CookMethod, string> = {
  grill: "焼く",
  simmer: "煮る",
  fry: "揚げる",
  stirfry: "炒める",
  steam: "蒸す",
  raw: "生",
  other: "その他",
};

export const SOURCE_LABEL: Record<RecipeSource, string> = {
  ai: "AI生成",
  manual: "手動登録",
};

export const STATUS_LABEL: Record<RecipeStatus, string> = {
  draft: "未確認",
  active: "登録済み",
  archived: "もう作らない",
};

export const SHOP_CATEGORY_LABEL: Record<ShopCategory, string> = {
  produce: "青果",
  meat: "精肉",
  seafood: "鮮魚",
  tofu: "豆腐・練物",
  dairy_egg: "乳・卵",
  dry: "乾物",
  seasoning: "調味料",
  other: "その他",
};

export const FOOD_GROUP_LABEL: Record<number, string> = {
  1: "1群 魚肉卵豆",
  2: "2群 乳・海藻",
  3: "3群 緑黄色野菜",
  4: "4群 淡色野菜",
  5: "5群 穀類・いも",
  6: "6群 油脂",
};

/* 分量の表示。qty が無い材料（適量など）は単位だけを出す。

   「大さじ」「小さじ」は数の前に置く。日本語のレシピはそう書くため、
   「1.5 大さじ」ではなく「大さじ1と1/2」と出す。 */
const UNIT_BEFORE_QTY = ["大さじ", "小さじ"];

/* 4分の1きざみの端数は分数で書く。料理ではそのほうが読み取りやすい。 */
const FRACTION: Readonly<Record<string, string>> = {
  "0.25": "1/4",
  "0.5": "1/2",
  "0.75": "3/4",
};

export function formatNumber(qty: number): string {
  const sign = qty < 0 ? "-" : "";
  const abs = Math.abs(qty);
  const whole = Math.floor(abs);
  const rest = Math.round((abs - whole) * 100) / 100;
  const fraction = FRACTION[String(rest)];

  if (!fraction) return String(qty);
  if (whole === 0) return `${sign}${fraction}`;
  return `${sign}${whole}と${fraction}`;
}

export function formatQuantity(
  qty: number | null,
  unit: string | null,
): string {
  if (qty === null) return unit ?? "適量";
  const value = formatNumber(qty);
  if (!unit) return value;
  if (UNIT_BEFORE_QTY.includes(unit)) return `${unit}${value}`;
  return `${value} ${unit}`;
}

/* 増減の刻み。
   g と ml は 1 ずつでは細かすぎるので 10。
   1 以下や端数のあるものは 4分の1（依頼者の指定）。それ以外は 1。 */
export function quantityStep(qty: number, unit: string | null): number {
  if (unit === "g" || unit === "ml") return 10;
  if (!Number.isInteger(qty) || qty <= 1) return 0.25;
  return 1;
}

/* 世帯人数への換算（仕様書 5.2-4「世帯人数に換算した分量」）。 */
export function scaleQuantity(
  qty: number | null,
  recipeServings: number,
  householdServings: number,
): number | null {
  if (qty === null) return null;
  if (recipeServings <= 0) return qty;
  const scaled = (qty * householdServings) / recipeServings;
  return Math.round(scaled * 100) / 100;
}
