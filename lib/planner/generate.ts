import {
  containsAvoided,
  cookTimeLimit,
  daysBetween,
  validateWeek,
} from "./constraints.ts";
import { createRandom, type Random } from "./random.ts";
import type {
  MainHistory,
  Violation,
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

/* 和洋中の目安を、比率から1週間ぶんの品数に直す（変更記録 3.32）。
   合計が0なら目安を持たない。「その他」は比率を持たないので数えない。 */
function categoryTarget(
  ratio: PlannerSettings["categoryRatio"],
): Readonly<Record<string, number>> {
  const total = ratio.washoku + ratio.yoshoku + ratio.chuka;
  if (total <= 0) return {};
  return {
    washoku: (ratio.washoku / total) * 7,
    yoshoku: (ratio.yoshoku / total) * 7,
    chuka: (ratio.chuka / total) * 7,
  };
}

/* 和洋中の重み。たんぱく源（+30〜45）より上限を低くしてある。
   たんぱく源は 7.1 のハード制約に直結しているが、和洋中は好みなので、
   競り合ったときはたんぱく源を優先させる。

   12 から 60 まで振って測ったところ、30 を超えると寄りがほとんど改善せず、
   在庫の少ないカテゴリは頭打ちになる。天井は重みではなくレシピの数。 */
const CATEGORY_BONUS = 30;
const CATEGORY_PENALTY = -25;

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
    undecided: false,
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
  for (const date of request.undecidedDays ?? []) {
    const day = days.find((d) => d.date === date);
    if (!day) continue;
    day.undecided = true;
    day.mainId = null;
    day.sideId = null;
    day.soupId = null;
  }
  for (const noCook of request.noCookDays ?? []) {
    const day = days.find((d) => d.date === noCook.date);
    if (!day) continue;
    day.entryType = noCook.entryType;
    day.undecided = false;
    day.locked = true;
    day.mainId = null;
  }

  /* 2. 候補プールの構築（7.2-2） */
  const avoided = [...settings.allergies, ...settings.disliked];
  const usable = recipes.filter((recipe) => !containsAvoided(recipe, avoided));

  const allMains = usable.filter((recipe) => recipe.dishType === "main");
  const sides = usable.filter((recipe) => recipe.dishType === "side");
  const soups = usable.filter((recipe) => recipe.dishType === "soup");

  /* 登録そのものが足りないときは、間隔をどう縮めても組めない。 */
  if (allMains.length < MIN_MAIN_POOL) {
    return {
      ok: false,
      reason: "not_enough_mains",
      total: allMains.length,
      need: MIN_MAIN_POOL,
    };
  }

  const poolWithGap = (gap: number) => {
    const recentlyUsed = new Set(
      history
        .filter((entry) =>
          dates.some(
            (date) => Math.abs(daysBetween(entry.date, date)) < gap,
          ),
        )
        .map((entry) => entry.recipeId),
    );
    return allMains.filter((recipe) => !recentlyUsed.has(recipe.id));
  };

  /* 先週使った主菜を全部外すと、登録が少ないうちは候補が尽きる。
     たとえば主菜15件で7日ぶん使うと、翌週に残るのは8件しかない。

     組めないと言って止めるより、同じ主菜を空ける日数を縮めて組む。
     縮めたことは violations に載せて画面に出す（黙って変えない）。 */
  let effectiveGap = settings.repeatGapDays;
  let mains = poolWithGap(effectiveGap);
  /* 縮めずに済ませるには、主菜があと何件あればよかったか。
     履歴で外れる分は増やしようがないので、足りない数がそのまま答えになる。 */
  const need = Math.max(0, MIN_MAIN_POOL - mains.length);
  while (mains.length < MIN_MAIN_POOL && effectiveGap > 0) {
    effectiveGap -= 1;
    mains = poolWithGap(effectiveGap);
  }

  /* 比率どおりに出そうにも、そのカテゴリのレシピが足りないことがある。
     週に5回出すには5件要る（同じ週に同じ主菜は使えないため）。
     黙って比率を無視するより、届かないことを伝える（変更記録 3.32）。 */
  const short: Violation[] = [];
  for (const [category, target] of Object.entries(
    categoryTarget(settings.categoryRatio),
  )) {
    const want = Math.round(target);
    const have = allMains.filter((recipe) => recipe.category === category).length;
    if (want > have) short.push({ kind: "category_short", category, have, want });
  }

  const relaxed: Violation[] =
    effectiveGap === settings.repeatGapDays
      ? []
      : [
          {
            kind: "repeat_gap_relaxed",
            from: settings.repeatGapDays,
            to: effectiveGap,
            need,
          },
        ];

  /* 縮めた間隔で検査する。縮めた事実は別に伝えるので、
     同じ主菜が出たことを二重に責めない。 */
  const effectiveSettings: PlannerSettings = {
    ...settings,
    repeatGapDays: effectiveGap,
  };

  /* 3〜5. 主菜を決め、副菜と汁物を足し、ハード制約を確かめる。
     満たせない日を開け直して10回まで組み直す（7.2-5）。 */
  let attempts = 0;
  let violations = validateWeek({
    weekStart,
    days,
    byId,
    settings: effectiveSettings,
    history,
  });

  const fillable = (day: PlanDay) =>
    day.entryType === "cook" && !day.undecided && !day.locked;

  let open = days.filter(fillable);

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
      settings: effectiveSettings,
      ratings,
      request,
      random,
      byId,
    });
    assignSidesAndSoups({ days, sides, soups, byId, request });

    violations = validateWeek({
      weekStart,
      days,
      byId,
      settings: effectiveSettings,
      history,
    });
    if (violations.length === 0) break;

    /* 違反に関わる日だけを開け直す。固定枠は動かさない。 */
    const stuck = new Set(datesInViolations(violations));
    open = days.filter((day) => fillable(day) && stuck.has(day.date));
    /* 特定の日に紐づかない違反（魚や大豆の不足）は週全体を組み直す。 */
    if (open.length === 0) open = days.filter(fillable);
  }

  return {
    ok: true,
    plan: {
      weekStart,
      days,
      violations: [...relaxed, ...short, ...violations],
      attempts,
    },
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

  const requested = new Set(request.requestedMainIds ?? []);
  const categoryGoal = categoryTarget(settings.categoryRatio);

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
    const placedCategory = countCategories(days, byId, day);

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

      /* 和洋中の目安。設定の比率で7日を割り振った数に寄せる。
         「その他」は比率を持たないので、寄せも罰もしない。 */
      const catTarget = categoryGoal[candidate.category];
      if (catTarget !== undefined) {
        const left = catTarget - (placedCategory[candidate.category] ?? 0);
        score += left > 0 ? CATEGORY_BONUS : CATEGORY_PENALTY;
      }

      if (previous && candidate.category === previous.category) score -= 20;
      if (previous && candidate.method === previous.method) score -= 15;

      score += 20; // 上限内に収まっている
      score += (ratings[candidate.id] ?? 0) * 5;
      score += Math.min(sharedIngredients(days, byId, index, candidate), 3) * 10;
      score += requestBonus(candidate, request.tags ?? []);
      /* リクエストされた料理を押し上げる。他のどの項目より重くしてあるが、
         時間の上限や揚げ物の連続といったハード制約は越えない。
         それらは上で候補から外れている（7.1）。 */
      if (requested.has(candidate.id)) score += REQUEST_BONUS;
      score += random() * 10;

      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    day.mainId = best?.id ?? null;
  }
}

function countCategories(
  days: readonly PlanDay[],
  byId: (id: string | null) => PlannerRecipe | null,
  exclude: PlanDay,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const day of days) {
    if (day === exclude) continue;
    const main = byId(day.mainId);
    if (!main) continue;
    counts[main.category] = (counts[main.category] ?? 0) + 1;
  }
  return counts;
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

/* リクエストの重み。他の項目の振れ幅（たんぱく源の配分・評価・食材の使い切り・
   ゆらぎ）を足しても届かない大きさにしてある。狙って大きくしているので、
   数字を下げるとリクエストが効かない週が出る。 */
const REQUEST_BONUS = 200;

function requestBonus(
  candidate: PlannerRecipe,
  tags: readonly string[],
): number {
  if (tags.length === 0) return 0;
  let bonus = 0;
  for (const tag of tags) {
    if (tag === "魚" && candidate.mainProtein === "fish") bonus += 20;
    if (tag === "大豆" && candidate.mainProtein === "soy") bonus += 20;
    if (tag === "揚げ物なし" && candidate.method === "fry") bonus -= 40;
    /* 前の週で届かなかった食品群を押し上げる（仕様書 10章）。 */
    if (tag === "緑黄色野菜" && candidate.foodGroups.includes(3)) bonus += 20;
    if (tag === "乳製品" && candidate.foodGroups.includes(2)) bonus += 20;
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
  request: PlanRequest;
}) {
  const { days, sides, soups, byId, request } = input;

  /* 手で選んだ日は自動で選び直さない。 */
  const pinnedSides = new Map(
    (request.fixedSides ?? []).map((pin) => [pin.date, pin.recipeId]),
  );
  const pinnedSoups = new Map(
    (request.fixedSoups ?? []).map((pin) => [pin.date, pin.recipeId]),
  );

  for (const [index, day] of days.entries()) {
    if (day.entryType !== "cook" || day.undecided) {
      day.sideId = null;
      day.soupId = null;
      continue;
    }

    if (pinnedSides.has(day.date)) {
      day.sideId = pinnedSides.get(day.date) ?? null;
    }
    if (pinnedSoups.has(day.date)) {
      day.soupId = pinnedSoups.get(day.date) ?? null;
    }
    if (pinnedSides.has(day.date) && pinnedSoups.has(day.date)) continue;

    const main = byId(day.mainId);
    const covered = new Set(main?.foodGroups ?? []);
    const missing = FOOD_GROUPS.filter((group) => !covered.has(group));

    /* 直前2日と同じものは避ける。食品群だけで選ぶと、同じ副菜が
       何日も続いて食卓が単調になる（7.2 の「単調化の防止」と同じ趣旨）。 */
    const recentSides = recentIds(days, index, (d) => d.sideId);
    const recentSoups = recentIds(days, index, (d) => d.soupId);

    const side = pinnedSides.has(day.date)
      ? byId(day.sideId)
      : (pickFilling(sides, missing, recentSides) ?? null);
    if (!pinnedSides.has(day.date)) day.sideId = side?.id ?? null;
    for (const group of side?.foodGroups ?? []) covered.add(group);

    if (!pinnedSoups.has(day.date)) {
      const stillMissing = FOOD_GROUPS.filter((group) => !covered.has(group));
      day.soupId = pickFilling(soups, stillMissing, recentSoups)?.id ?? null;
    }
  }

  fillSoyWithSides({ days, sides, soups, byId, pinnedSides });
}

/* 大豆製品は主菜または副菜で週2回以上（7.1）。
   目標配分では主菜の大豆は1回なので、届かないぶんを副菜で補う。
   食品群だけで副菜を選ぶと、ここが埋まらない週が出る。 */
function fillSoyWithSides(input: {
  days: PlanDay[];
  sides: readonly PlannerRecipe[];
  soups: readonly PlannerRecipe[];
  byId: (id: string | null) => PlannerRecipe | null;
  pinnedSides: ReadonlyMap<string, string | null>;
}) {
  const { days, sides, soups, byId, pinnedSides } = input;

  const soySides = sides.filter((recipe) => recipe.mainProtein === "soy");
  if (soySides.length === 0) return;

  const hasSoy = (day: PlanDay) =>
    [byId(day.mainId), byId(day.sideId)].some(
      (recipe) => recipe?.mainProtein === "soy",
    );

  const cookDays = days.filter(
    (day) => day.entryType === "cook" && !day.undecided,
  );
  let count = cookDays.filter(hasSoy).length;

  for (const day of cookDays) {
    if (count >= 2) break;
    if (hasSoy(day)) continue;
    /* 手で選んだ副菜は動かさない。 */
    if (pinnedSides.has(day.date)) continue;

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
