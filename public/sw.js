/* ホーム画面に置けるようにするための Service Worker。

   仕様書 2.1 はオフライン非対応と定めている。したがって内容を蓄えない。
   fetch をそのまま通すだけにしてある。

   蓄えると、配信し直しても古い画面が残る。前回の構成で「手元では動くのに
   本番が違う」という切り分けに手間取ったので、そこは繰り返さない。 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  /* 何も差し替えない。ブラウザの通常の取得に任せる。 */
});
