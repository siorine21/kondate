-- 買い物リストに列を2つ足す（変更記録 3.25）
--
-- 週に2回買い物へ行くため、確定のたびに作り直すのをやめ、
-- いまの行と新しい集計を突き合わせるようにした。それに要る2列。
--
--   carried_from  前の週から引き継いだ品の、元の週の週頭（日曜）。
--                 買えなかったものを次の週へ持ち越し、
--                 いつから持ち越しているかを画面に出す。
--
--   qty_edited    数量を手で直したしるし。
--                 確定のたびに上書きすると、
--                 「今週は多めに買う」という直しが消えてしまう。
--
-- 列を足すだけで、既存のデータは変わりません。
-- 何度実行しても結果は同じです。

alter table shopping_items
  add column if not exists carried_from date;

alter table shopping_items
  add column if not exists qty_edited boolean not null default false;

-- 引き継ぎ元をたどるときに使う。
create index if not exists shopping_items_carried_from
  on shopping_items (plan_id, carried_from);

-- 確認：2行返れば追加されています。
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'shopping_items'
  and column_name in ('carried_from', 'qty_edited')
order by column_name;
