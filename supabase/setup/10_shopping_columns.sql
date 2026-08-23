-- 買い物リストに列を2つ足す（変更記録 3.16 / 3.18）
--
--   purchased_at  レジを通した時刻。
--                 checked（かごに入れた）と分けて持つ。
--                 会計した品は一覧から畳まれ、買えなかった品だけが残る。
--
--   is_extra      献立から作られたものではなく、手で足した品。
--                 週を組み直して確定しても消えない。
--
-- 列を足すだけで、既存のデータは変わりません。
-- 何度実行しても結果は同じです。

alter table shopping_items
  add column if not exists purchased_at timestamptz;

alter table shopping_items
  add column if not exists is_extra boolean not null default false;

-- 確認：2行返れば追加されています。
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'shopping_items'
  and column_name in ('purchased_at', 'is_extra')
order by column_name;
