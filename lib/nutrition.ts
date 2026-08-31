import type { PlanDay, PlannerRecipe } from "./planner/types.ts";

/* 栄養評価（仕様書 10章）。

   kcal・PFC は計算しない（1.4）。六つの基礎食品群のカバレッジと、
   週次目標の達成状況だけを見る。

   純粋関数。Supabase を import しない（仕様書 2.3）。 */

export type GoalKey = "fish" | "soy" | "veg" | "fry" | "dairy";

export type Goal = {
  key: GoalKey;
  label: string;
  /* 実績。fry だけは「連続が無い」という真偽で持つ。 */
  actual: number;
  target: number;
  met: boolean;
  /* 達成できていないときに、次の生成で押し上げる手がかり。 */
  hint: string;
};

export type Nutrition = {
  /* 群ごとのカバレッジ 0〜1。分母は自炊する日数（変更記録 3.26）。 */
  coverage: Record<number, number>;
  /* 群ごとの実日数。画面に「5日／7日」と出すため。 */
  days: Record<number, number>;
  /* 判定に使った日数。外食と未定を除いた自炊の日数。 */
  cookDays: number;
  goals: Goal[];
  /* 和洋中の配分。横積みバーに使う。 */
  categoryMix: { category: string; count: number }[];
};

const GROUPS = [1, 2, 3, 4, 5, 6];

export function evaluateWeek(input: {
  days: readonly PlanDay[];
  byId: (id: string | null) => PlannerRecipe | null;
}): Nutrition {
  const { days, byId } = input;

  /* 自炊しない日と未定の日は判定から外す。品が無いので満たしようがない。
     7で割ると、外食の多い週ほど不当に低く出る（変更記録 3.26）。 */
  const cook = days.filter((day) => day.entryType === "cook" && !day.undecided);

  const dishesOf = (day: PlanDay) =>
    [day.mainId, day.sideId, day.soupId]
      .map(byId)
      .filter((recipe): recipe is PlannerRecipe => recipe !== null);

  const dayCount = (has: (dishes: PlannerRecipe[]) => boolean) =>
    cook.filter((day) => has(dishesOf(day))).length;

  const groupDays: Record<number, number> = {};
  const coverage: Record<number, number> = {};
  for (const group of GROUPS) {
    const count = dayCount((dishes) =>
      dishes.some((dish) => dish.foodGroups.includes(group)),
    );
    groupDays[group] = count;
    coverage[group] = cook.length > 0 ? count / cook.length : 0;
  }

  const fish = cook.filter(
    (day) => byId(day.mainId)?.mainProtein === "fish",
  ).length;

  const soy = dayCount((dishes) =>
    dishes.some((dish) => dish.mainProtein === "soy"),
  );

  /* 揚げ物が2日続いていないか。7.1 のハード制約と同じ見方をする。 */
  let fryInARow = 0;
  for (let i = 1; i < cook.length; i += 1) {
    const previous = byId(cook[i - 1].mainId);
    const current = byId(cook[i].mainId);
    if (previous?.method === "fry" && current?.method === "fry") fryInARow += 1;
  }

  const goals: Goal[] = [
    {
      key: "fish",
      label: "魚を週2回以上",
      actual: fish,
      target: 2,
      met: fish >= 2,
      hint: "魚",
    },
    {
      key: "soy",
      label: "大豆製品を週2回以上",
      actual: soy,
      target: 2,
      met: soy >= 2,
      hint: "大豆",
    },
    {
      key: "veg",
      label: "緑黄色野菜を毎日",
      actual: groupDays[3] ?? 0,
      target: cook.length,
      met: (groupDays[3] ?? 0) >= cook.length && cook.length > 0,
      hint: "緑黄色野菜",
    },
    {
      key: "fry",
      label: "揚げ物の連日なし",
      actual: fryInARow,
      target: 0,
      met: fryInARow === 0,
      hint: "揚げ物なし",
    },
    {
      key: "dairy",
      label: "乳製品・海藻を週3回以上",
      actual: groupDays[2] ?? 0,
      target: 3,
      met: (groupDays[2] ?? 0) >= 3,
      hint: "乳製品",
    },
  ];

  const mix = new Map<string, number>();
  for (const day of cook) {
    const main = byId(day.mainId);
    if (!main) continue;
    mix.set(main.category, (mix.get(main.category) ?? 0) + 1);
  }

  return {
    coverage,
    days: groupDays,
    cookDays: cook.length,
    goals,
    categoryMix: [...mix.entries()].map(([category, count]) => ({
      category,
      count,
    })),
  };
}

/* 達成できなかった目標を、次の生成で押し上げる手がかりに変える（仕様書 10章）。
   generateWeek の request.tags がこれを受け取る。 */
export function unmetTags(nutrition: Nutrition): string[] {
  return nutrition.goals.filter((goal) => !goal.met).map((goal) => goal.hint);
}
