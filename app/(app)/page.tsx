/* 今日の献立（トップ）。
   Phase 0 では画面の骨格のみ。実データの表示は Phase 7 で組む。 */
export default function TodayPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5">
      <h1 className="font-mincho text-[38px] font-bold tracking-[0.08em] text-ink">
        献立
      </h1>
      <p className="mt-3 font-mono text-[9.5px] tracking-[0.24em] text-ink-3">
        KONDATE
      </p>
      <p className="mt-8 text-center text-[12.5px] leading-[1.9] text-ink-2">
        今週の献立はまだありません。
        <br />
        作成すると 7 日分がまとめて決まります。
      </p>
    </main>
  );
}
