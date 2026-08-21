import { z } from "zod";

import rawSeed from "@/supabase/setup/seed-recipes.json";

/* はじめの20品（仕様書 11.1）。

   JSON は 04_seed_recipes.sql を PostgreSQL に流した結果を書き出したもので、
   手では書いていない。SQL と画面から入る内容がずれない。

   JSON の import は型が string まで緩むため、zod で ENUM まで絞る。
   `as` での握りつぶしは使わない（仕様書 2.2-10）。 */

const seedRecipe = z.object({
  name: z.string(),
  category: z.enum(["washoku", "yoshoku", "chuka", "other"]),
  dish_type: z.enum(["main", "side", "soup", "rice"]),
  main_protein: z.enum(["meat", "fish", "egg", "soy", "none"]),
  method: z.enum([
    "grill",
    "simmer",
    "fry",
    "stirfry",
    "steam",
    "raw",
    "other",
  ]),
  cook_time_min: z.number().int(),
  servings: z.number().int(),
  food_groups: z.array(z.number().int()),
  tags: z.array(z.string()),
  steps: z.array(z.string()),
  ingredients: z.array(
    z.object({
      name: z.string(),
      qty: z.number().nullable(),
      unit: z.string().nullable(),
      shop_category: z.enum([
        "produce",
        "meat",
        "seafood",
        "tofu",
        "dairy_egg",
        "dry",
        "seasoning",
        "other",
      ]),
      sort_order: z.number().int(),
    }),
  ),
});

export type SeedRecipe = z.infer<typeof seedRecipe>;

export const SEED_RECIPES: readonly SeedRecipe[] = z
  .object({ recipes: z.array(seedRecipe) })
  .parse(rawSeed).recipes;
