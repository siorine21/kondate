import { CATEGORY_LABEL } from "@/lib/labels";
import type { Violation } from "@/lib/planner";

/* 10回組み直しても満たせなかった制約を隠さずに出す（仕様書 7.1）。
   黙って緩めると、栄養の偏りに気づけない。 */

/* 和洋中の名前。想定外の値が来ても、そのまま出して落とさない。 */
function categoryLabel(category: string): string {
  const known = Object.keys(CATEGORY_LABEL).find((key) => key === category);
  return known ? CATEGORY_LABEL[known as keyof typeof CATEGORY_LABEL] : category;
}

function describe(violation: Violation): string {
  switch (violation.kind) {
    case "fish_shortage":
      return `魚が週${violation.actual}回です（目標は${violation.target}回）`;
    case "soy_shortage":
      return `大豆製品が週${violation.actual}回です（目標は${violation.target}回）`;
    case "vegetable_missing":
      return `緑黄色野菜がない日があります（${violation.dates.length}日）`;
    case "fry_in_a_row":
      return "揚げ物が2日続いています";
    case "main_repeated":
      return "同じ主菜が間隔を空けずに出ています";
    case "category_three_in_a_row":
      return "同じ和洋中が3日続いています";
    case "allergy_included":
      return "アレルギーの食材が入っています";
    case "cook_time_over":
      return `調理時間が上限（${violation.limit}分）を超える日があります`;
    case "category_short":
      return (
        `${categoryLabel(violation.category)}の主菜が${violation.have}件では、` +
        `設定した比率どおりの週${violation.want}回にできません。` +
        `あと${violation.want - violation.have}件登録すると届きます`
      );
    case "repeat_gap_relaxed":
      return (
        `同じ主菜を空ける日数を${violation.from}日から${violation.to}日に縮めました。` +
        `主菜をあと${violation.need}件登録すると、${violation.from}日空けられます`
      );
  }
}

export function Violations({
  violations,
}: {
  violations: readonly Violation[];
}) {
  if (violations.length === 0) return null;

  /* 同じ種類は1行にまとめる。 */
  const lines = [...new Set(violations.map(describe))];

  /* 間隔を縮めただけなら、直す先は「主菜を増やす」だけ。
     調理時間の話を混ぜると、どこを触ればよいか分からなくなる。 */
  const onlyRelaxed = violations.every(
    (violation) => violation.kind === "repeat_gap_relaxed",
  );

  return (
    <section className="mt-3 rounded-card border border-line bg-card p-3.5">
      <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3">
        条件について
      </p>
      <ul className="mt-1.5">
        {lines.map((line) => (
          <li
            className={`text-[12.5px] leading-[1.9] ${
              onlyRelaxed ? "text-ink-2" : "text-danger"
            }`}
            key={line}
          >
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11.5px] leading-[1.8] text-ink-3">
        {onlyRelaxed
          ? "主菜を増やすと、同じ料理が出る間隔を広げられます。"
          : "主菜を増やすか、設定の調理時間の上限をゆるめると収まります。"}
      </p>
    </section>
  );
}
