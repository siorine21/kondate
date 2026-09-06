"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { backTo, type Origin } from "@/lib/nav";

/* 画面左上の「もどる」。

   親指で押す前提なので、当たり判定を 44px 以上とる。

   行き方が2つ以上ある画面（買い物リスト・栄養サマリ・レシピ詳細）は、
   リンクに付いてきた ?from= を見て遷移元へ返す（仕様書 5.4 / 変更記録 3.37）。
   ブラウザの履歴には頼らない。直接ひらいたときは fallback の親へ返す。 */

export function BackLink({ fallback }: { fallback: Origin }) {
  /* useSearchParams は静的書き出しでは境界が要る。
     ここで囲っておけば、使う画面はただ置くだけで済む。
     クエリを読む前は、既定の親を出しておけばよい。 */
  return (
    <Suspense fallback={<Chrome {...backTo(null, fallback)} />}>
      <FromLink fallback={fallback} />
    </Suspense>
  );
}

function FromLink({ fallback }: { fallback: Origin }) {
  const back = backTo(useSearchParams().get("from"), fallback);
  return <Chrome {...back} />;
}

function Chrome({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="-ml-2 inline-flex min-h-[48px] items-center gap-2 whitespace-nowrap rounded-[10px] px-2 text-[13.5px] text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ai"
      href={href}
    >
      <span aria-hidden className="text-[22px] leading-none text-ink-3">
        ‹
      </span>
      {label}
    </Link>
  );
}
