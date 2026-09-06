/* 設定画面で共通に使う小さな部品。文言と余白をここに集約する。 */

export const labelClass =
  "mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-ink-3";

export const fieldClass =
  "w-full rounded-[10px] border border-line bg-card px-[13px] py-2.5 text-[14px] text-ink " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai";

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-[26px]">
      <h2 className="font-mono text-[9.5px] tracking-[0.2em] text-ink-3">
        {title}
      </h2>
      {note ? (
        <p className="mt-1.5 text-[11.5px] leading-[1.8] text-ink-3">{note}</p>
      ) : null}
      <div className="mt-[9px] rounded-card border border-line bg-card p-4">
        {children}
      </div>
    </section>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    /* 見出しは折り返さない。入りきらないときは値のほうを次の行へ送る。
       1行に詰めると「休日の調理時間の／上限」のような切れ方をする（3.36）。 */
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 py-3 last:border-0">
      <span className="whitespace-nowrap text-[13.5px] text-ink">{label}</span>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      className="w-full rounded-[11px] bg-ai py-3 text-[13.5px] font-medium tracking-[0.03em] text-white disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function Note({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p
      className={`mt-2 text-[12px] leading-[1.7] ${tone === "ok" ? "text-ok" : "text-danger"}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}
