-- 買い物リストのチェックを2端末で同期する（仕様書 9章 / 5.2-6）
--
-- Supabase の Realtime は、発行（publication）に入れたテーブルの変更だけを配る。
-- shopping_items を入れないと、片方でチェックしても相手の画面は変わらない。
--
-- 何度実行しても結果は同じです。

-- 1) 変更を配る対象に加える
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shopping_items'
  ) then
    alter publication supabase_realtime add table shopping_items;
  end if;
end $$;

-- 2) 変更前の行も一緒に配る
--    RLS の判定に使われるため、これが無いと配信が落ちることがある。
alter table shopping_items replica identity full;

-- 3) 確認：1行返れば有効です。
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and tablename = 'shopping_items';
