import Link from "next/link";

/* 画面左上の「もどる」。

   親指で押す前提なので、当たり判定を 44px 以上とる。
   遷移元を保持する必要がある画面では href を渡し分ける（仕様書 5.4）。 */

export function BackLink({
  href,
  children = "もどる",
}: {
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      className="-ml-2 inline-flex min-h-[48px] items-center gap-2 rounded-[10px] px-2 text-[13.5px] text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      href={href}
    >
      <span aria-hidden className="text-[22px] leading-none text-ink-3">
        ‹
      </span>
      {children}
    </Link>
  );
}
