-- 買い物リストに「買い終えた」を持たせる（変更記録 3.16）
--
-- 週の途中で何度か買い物に行くため、
--   checked      = かごに入れた
--   purchased_at = レジを通した
-- の2つを分けて持ちます。会計を済ませた品は一覧から畳まれ、
-- 買えなかった品だけが次の買い物に残ります。
--
-- 列を足すだけで、既存のデータは変わりません。
-- 何度実行しても結果は同じです。

alter table shopping_items
  add column if not exists purchased_at timestamptz;

-- 確認：1行返れば追加されています。
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'shopping_items'
  and column_name = 'purchased_at';
