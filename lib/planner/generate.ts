import {
  containsAvoided,
  cookTimeLimit,
  daysBetween,
  validateWeek,
} from "./constraints.ts";
import { createRandom, type Random } from "./random.ts";
import type {
  MainHistory,
  PlanDay,
  PlanRequest,
  PlanResult,
  PlannerRecipe,
  PlannerSettings,
} from "./types.ts";

/* 週間献立の生成（仕様書 7.2）。

   AI は使わない（仕様書 2.2-5）。同じ種を渡せば同じ結果になる。
   Supabase を import しない。入力は全て引数で受け取る（2.3）。 */

/* 主菜のたんぱく源の目標配分（7.2）。合計7日分。 */
const PROTEIN_TARGET: Readonly<Record<string, number>> = {
  meat: 3,
  fish: 2,
  egg: 1,
  soy: 1,
};

/* 主菜がこれを下回ると週を組めない（7.2-2）。 */
const MIN_MAIN_POOL = 10;

const FOOD_GROUPS = [1, 2, 3, 4, 5, 6];

export function weekDates(weekStart: string): string[] {
  const base = Date.parse(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(base + i * 86400000).toISOString().slice(0, 10),
  );
}

export function generateWeek(input: {
  weekStart: string;
  recipes: readonly PlannerRecipe[];
  settings: PlannerSettings;
  history?: readonly MainHistory[];
  /* レシピIDごとの平均★（1〜3）。2人の平均（7.2）。 */
  ratings?: Readonly<Record<string, number>>;
  request?: PlanRequest;
  seed: number;
}): PlanResult {
  const {
    weekStart,
    recipes,
    settings,
    history = [],
    ratings = {},
    request = {},
    seed,
  } = input;

  const random = createRandom(seed);
  const dates = weekDates(weekStart);
  const byId = (id: string | null) =>
    recipes.find((recipe) => recipe.id === id) ?? null;

  /* 1. 固定枠と自炊しない日の配置（7.2-1） */
  const days: PlanDay[] = dates.map((date) => ({
    date,
    entryType: "cook",
    locked: false,
    mainId: null,
    sideId: null,
    soupId: null,
  }));

  for (const fixed of request.fixedDays ?? []) {
    const day = days.find((d) => d.date === fixed.date);
    if (!day) continue;
    day.mainId = fixed.recipeId;
    day.locked = true;
  }
  for (const noCook of request.noCookDays ?? []) {
    const day = days.find((d) => d.date === noCook.date);
    if (!day) continue;
    day.entryType = noCook.entryType;
    day.locked = true;
    day.mainId = null;
  }

  /* 2. 候補プールの構築（7.2-2） */
  const avoided = [...settings.allergies, ...settings.disliked];
  const usable = recipes.filter((recipe) => !containsAvoided(recipe, avoided));

  const recentlyUsed = new Set(
    history
      .filter((entry) =>
        dates.some(
          (date) =>
            Math.abs(daysBetween(entry.date, date)) < settings.repeatGapDays,
        ),
      )
      .map((entry) => entry.recipeId),
  );

  const mains = usable.filter(
    (recipe) => recipe.dishType === "main" && !recentlyUsed.has(recipe.id),
  );
  const sides = usable.filter((recipe) => recipe.dishType === "side");
  const soups = usable.filter((recipe) => recipe.dishType === "soup");

  if (mains.length < MIN_MAIN_POOL) {
    return {
      ok: false,
      reason: "not_enough_mains",
      have: mains.length,
      need: MIN_MAIN_POOL,
    };
  }

  /* 3〜5. 主菜を決め、副菜と汁物を足し、ハード制約を確かめる。
     満たせない日を開け直して10回まで組み直す（7.2-5）。 */
  let attempts = 0;
  let violations = validateWeek({
    weekStart,
    days,
    byId,
    settings,
    history,
  });

  let open = days.filter((day) => day.entryType === "cook" && !day.locked);

  while (attempts < 10) {
    attempts += 1;

    for (const day of open) {
      day.mainId = null;
    }
    assignMains({
      weekStart,
      days,
      open,
      mains,
      settings,
      ratings,
      request,
      random,
      byId,
    });
    assignSidesAndSoups({ days, sides, soups, byId });

    violations = validateWeek({ weekStart, days, byId, settings, history });
    if (violations.length === 0) break;

    /* 違反に関わる日だけを開け直す。固定枠は動かさない。 */
    const stuck = new Set(datesInViolations(violations));
    open = days.filter(
      (day) =>
        day.entryType === "cook" && !day.locked && stuck.has(day.date),
    );
    /* 特定の日に紐づかない違反（魚や大豆の不足）は週全体を組み直す。 */
    if (open.length === 0) {
      open = days.filter((day) => day.entryType === "cook" && !day.locked);
    }
  }

  return {
    ok: true,
    plan: { weekStart, days, violations, attempts },
  };
}

function datesInViolations(
  violations: readonly ReturnType<typeof validateWeek>[number][],
): string[] {
  const dates: string[] = [];
  for (const violation of violations) {
    if ("date" in violation) dates.push(violation.date);
    if ("dates" in violation) dates.push(...violation.dates);
  }
  return dates;
}

function assignMains(input: {
  weekStart: string;
  days: PlanDay[];
  open: readonly PlanDay[];
  mains: readonly PlannerRecipe[];
  settings: PlannerSettings;
  ratings: Readonly<Record<string, number>>;
  request: PlanRequest;
  random: Random;
  byId: (id: string | null) => PlannerRecipe | null;
}) {
  const { weekStart, days, open, mains, settings, ratings, request, random, byId } =
    input;

  for (const day of open) {
    const index = days.indexOf(day);
    const previous = index > 0 ? byId(days[index - 1].mainId) : null;
    const beforePrevious = index > 1 ? byId(days[index - 2].mainId) : null;
    const limit = cookTimeLimit(settings, weekStart, day.date);

    /* 前2日が同じカテゴリなら、そのカテゴリは置けない。
       7.1 はハード制約なので、点差ではなく候補の段階で外す。 */
    const bannedCategory =
      previous && beforePrevious && previous.category === beforePrevious.category
        ? previous.category
        : null;

    /* 今週すでに置いた主菜は候補から外す。
       同じ主菜を空ける日数は7日より長いのが既定（3.2）。 */
    const taken = new Set(
      days
        .filter((other) => other !== day && other.mainId)
        .map((other) => other.mainId),
    );

    const placed = countProteins(days, byId, day);

    let best: PlannerRecipe | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of mains) {
      if (taken.has(candidate.id)) continue;

      /* 調理時間の上限を超えるものは選ばない（7.2）。 */
      if (candidate.cookTimeMin > limit) continue;
      /* 揚げ物の2日連続は作らない。 */
      if (candidate.method === "fry" && previous?.method === "fry") continue;
      /* 同カテゴリの3日連続も作らない。 */
      if (bannedCategory && candidate.category === bannedCategory) continue;

      let score = 0;

      const target = PROTEIN_TARGET[candidate.mainProtein] ?? 0;
      const remaining = target - (placed[candidate.mainProtein] ?? 0);
      score += remaining > 0 ? 30 + remaining * 5 : -25;

      if (previous && candidate.category === previous.category) score -= 20;
      if (previous && candidate.method === previous.method) score -= 15;

      score += 20; // 上限内に収まっている
      score += (ratings[candidate.id] ?? 0) * 5;
      score += Math.min(sharedIngredients(days, byId, index, candidate), 3) * 10;
      score += requestBonus(candidate, request.tags ?? []);
      score += random() * 10;

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    day.mainId = best?.id ?? null;
  }
}

function countProteins(
  days: readonly PlanDay[],
  byId: (id: string | null) => PlannerRecipe | null,
  exclude: PlanDay,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const day of days) {
    if (day === exclude) continue;
    const main = byId(day.mainId);
    if (!main) continue;
    counts[main.mainProtein] = (counts[main.mainProtein] ?? 0) + 1;
  }
  return counts;
}

/* 前後2日以内の献立と重なる食材の数（7.2「食材の使い切り」）。 */
function sharedIngredients(
  days: readonly PlanDay[],
  byId: (id: string | null) => PlannerRecipe | null,
  index: number,
  candidate: PlannerRecipe,
): number {
  const near = new Set<string>();
  for (let i = index - 2; i <= index + 2; i += 1) {
    if (i === index || i < 0 || i >= days.length) continue;
    const main = byId(days[i].mainId);
    if (!main) continue;
    for (const name of main.ingredientNames) near.add(name);
  }
  return candidate.ingredientNames.filter((name) => near.has(name)).length;
}

function requestBonus(
  candidate: PlannerRecipe,
  tags: readonly string[],
): number {
  if (tags.length === 0) return 0;
  let bonus = 0;
  for (const tag of tags) {
    if (tag === "魚" && candidate.mainProtein === "fish") bonus += 15;
    if (tag === "大豆" && candidate.mainProtein === "soy") bonus += 15;
    if (tag === "揚げ物なし" && candidate.method === "fry") bonus -= 40;
    if (candidate.tags.includes(tag)) bonus += 15;
  }
  return bonus;
}

/* 副菜と汁物は、主菜に足りない食品群を埋める形で決める（7.2-4）。 */
function assignSidesAndSoups(input: {
  days: PlanDay[];
  sides: readonly PlannerRecipe[];
  soups: readonly PlannerRecipe[];
  byId: (id: string | null) => PlannerRecipe | null;
}) {
  const { days, sides, soups, byId } = input;

  for (const [index, day] of days.entries()) {
    if (day.entryType !== "cook") {
      day.sideId = null;
      day.soupId = null;
      continue;
    }

    const main = byId(day.mainId);
    const covered = new Set(main?.foodGroups ?? []);
    const missing = FOOD_GROUPS.filter((group) => !covered.has(group));

    /* 直前2日と同じものは避ける。食品群だけで選ぶと、同じ副菜が
       何日も続いて食卓が単調になる（7.2 の「単調化の防止」と同じ趣旨）。 */
    const recentSides = recentIds(days, index, (d) => d.sideId);
    const recentSoups = recentIds(days, index, (d) => d.soupId);

    const side = pickFilling(sides, missing, recentSides);
    day.sideId = side?.id ?? null;
    for (const group of side?.foodGroups ?? []) covered.add(group);

    const stillMissing = FOOD_GROUPS.filter((group) => !covered.has(group));
    day.soupId = pickFilling(soups, stillMissing, recentSoups)?.id ?? null;
  }

  fillSoyWithSides({ days, sides, soups, byId });
}

/* 大豆製品は主菜または副菜で週2回以上（7.1）。
   目標配分では主菜の大豆は1回なので、届かないぶんを副菜で補う。
   食品群だけで副菜を選ぶと、ここが埋まらない週が出る。 */
function fillSoyWithSides(input: {
  days: PlanDay[];
  sides: readonly PlannerRecipe[];
  soups: readonly PlannerRecipe[];
  byId: (id: string | null) => PlannerRecipe | null;
}) {
  const { days, sides, soups, byId } = input;

  const soySides = sides.filter((recipe) => recipe.mainProtein === "soy");
  if (soySides.length === 0) return;

  const hasSoy = (day: PlanDay) =>
    [byId(day.mainId), byId(day.sideId)].some(
      (recipe) => recipe?.mainProtein === "soy",
    );

  const cookDays = days.filter((day) => day.entryType === "cook");
  let count = cookDays.filter(hasSoy).length;

  for (const day of cookDays) {
    if (count >= 2) break;
    if (hasSoy(day)) continue;

    const main = byId(day.mainId);
    const covered = new Set(main?.foodGroups ?? []);
    const missing = FOOD_GROUPS.filter((group) => !covered.has(group));

    const side = pickFilling(soySides, missing);
    if (!side) continue;
    day.sideId = side.id;

    /* 副菜が変わったので、汁物も埋め直す。 */
    for (const group of side.foodGroups) covered.add(group);
    const stillMissing = FOOD_GROUPS.filter((group) => !covered.has(group));
    day.soupId = pickFilling(soups, stillMissing)?.id ?? null;

    count += 1;
  }
}

function recentIds(
  days: readonly PlanDay[],
  index: number,
  pick: (day: PlanDay) => string | null,
): string[] {
  const ids: string[] = [];
  for (let i = Math.max(0, index - 2); i < index; i += 1) {
    const id = pick(days[i]);
    if (id) ids.push(id);
  }
  return ids;
}

function pickFilling(
  candidates: readonly PlannerRecipe[],
  missing: readonly number[],
  avoid: readonly string[] = [],
): PlannerRecipe | null {
  const fresh = candidates.filter(
    (candidate) => !avoid.includes(candidate.id),
  );
  /* 避けた結果ひとつも残らないなら、避けずに選ぶ。 */
  return best(fresh.length > 0 ? fresh : candidates, missing);
}

function best(
  candidates: readonly PlannerRecipe[],
  missing: readonly number[],
): PlannerRecipe | null {
  let chosen: PlannerRecipe | null = null;
  let chosenFilled = -1;

  for (const candidate of candidates) {
    const filled = candidate.foodGroups.filter((group) =>
      missing.includes(group),
    ).length;
    /* 同点なら調理時間が短いほうを採る（7.2-4）。 */
    if (
      filled > chosenFilled ||
      (filled === chosenFilled &&
        chosen !== null &&
        candidate.cookTimeMin < chosen.cookTimeMin)
    ) {
      chosen = candidate;
      chosenFilled = filled;
    }
  }

  return chosen;
}
