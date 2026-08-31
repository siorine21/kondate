import Link from "next/link";

import { SettingsLink } from "./settings-link";

/* 今日の献立（トップ）。
   実データの表示は Phase 7 で組む。いまは移動できることを優先する。 */
export default function TodayPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5">
      <div className="flex justify-end pt-2">
        <SettingsLink />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center pb-16">
        <h1 className="font-mincho text-[38px] font-bold tracking-[0.08em] text-ink">
          献立
        </h1>
        <p className="mt-3 font-mono text-[9.5px] tracking-[0.24em] text-ink-3">
          KONDATE
        </p>
        <p className="mt-8 text-center text-[12.5px] leading-[1.9] text-ink-2">
          今週の献立はまだありません。
          <br />
          レシピを登録すると 7 日分がまとめて決まります。
        </p>
        <Link
          className="mt-7 flex min-h-[48px] w-full max-w-[280px] items-center justify-center rounded-[11px] bg-ai text-[13.5px] font-medium tracking-[0.03em] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          href="/week/"
        >
          今週の献立をひらく
        </Link>
        <Link
          className="mt-2.5 flex min-h-[48px] w-full max-w-[280px] items-center justify-center rounded-[11px] border border-line text-[13.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          href="/recipes/"
        >
          レシピを見る
        </Link>
        <Link
          className="mt-2.5 flex min-h-[48px] w-full max-w-[280px] items-center justify-center rounded-[11px] border border-line text-[13.5px] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
          href="/nutrition/"
        >
          栄養サマリを見る
        </Link>
      </div>
    </main>
  );
}
