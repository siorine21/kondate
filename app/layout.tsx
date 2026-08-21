import type { Metadata, Viewport } from "next";
import {
  Shippori_Mincho_B1,
  Zen_Kaku_Gothic_New,
  Roboto_Mono,
} from "next/font/google";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";
import { withBasePath } from "@/lib/config";

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
  /* ホーム画面に置いたときの見え方。basePath は自分で付ける。 */
  manifest: withBasePath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "献立",
    statusBarStyle: "default",
  },
  /* Next は mobile-web-app-capable だけを出す。古い iOS はこちらを見るため、
     手で足しておく。無いとアドレスバーが残る端末がある。 */
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [
      { url: withBasePath("/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: withBasePath("/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: withBasePath("/apple-touch-icon.png"),
  },
};

export const viewport: Viewport = {
  themeColor: "#F1F3EE",
  /* 端末の幅に合わせる。拡大は塞がない（仕様書 2.1 のアクセシビリティ）。 */
  width: "device-width",
  initialScale: 1,
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
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
