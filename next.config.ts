import type { NextConfig } from "next";

import { BASE_PATH } from "./lib/config";

/* GitHub Pages への静的配信。

   サーバーを持たない構成にしたため、Route Handler・ミドルウェア・
   Server Component は使わない。ブラウザが直接 Supabase を叩き、
   世帯のデータは RLS が守る（仕様書 3.3）。 */
const nextConfig: NextConfig = {
  output: "export",
  basePath: BASE_PATH,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
