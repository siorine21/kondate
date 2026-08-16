import type { Metadata } from "next";
import {
  Shippori_Mincho_B1,
  Zen_Kaku_Gothic_New,
  Roboto_Mono,
} from "next/font/google";
import "./globals.css";

/* 書体は 3 つで役割を分ける（仕様書 5.6）。
   CSS 変数として公開し、globals.css の @theme が Tailwind に橋渡しする。 */
const shippori = Shippori_Mincho_B1({
  weight: ["500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-shippori",
});

const zen = Zen_Kaku_Gothic_New({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-zen",
});

const robotoMono = Roboto_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-roboto-mono",
});

export const metadata: Metadata = {
  title: "献立",
  description: "週間の夕食献立と買い物リストをまとめて用意します。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ja"
      className={`${shippori.variable} ${zen.variable} ${robotoMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
