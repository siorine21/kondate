import type { ShopCategory } from "@/lib/supabase/types";

/* 売り場の並び順。この順がそのまま買い物リストの表示順になる（仕様書 3.1）。
   スーパーの動線に合わせてあるので、勝手に入れ替えない。

   買い物リストの組み立ては単体テストから直接読むため、
   別名（@/）を使わずに済むよう独立したファイルに置いている。 */
export const SHOP_CATEGORY_ORDER: readonly ShopCategory[] = [
  "produce",
  "meat",
  "seafood",
  "tofu",
  "dairy_egg",
  "dry",
  "seasoning",
  "other",
];
