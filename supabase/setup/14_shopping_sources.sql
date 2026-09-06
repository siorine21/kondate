-- 買い物リストに「何のレシピに使うか」を持たせる（変更記録 3.35）
--
--   sources  この品がどの料理に、いくつ要るかの内訳。
--            [{"recipeId": "...", "name": "鶏の照り焼き", "qty": 1.5}, ...]
--
-- 確定したときに一緒に書き込む。買い物リストは店内で開くので、
-- 開くたびにレシピと材料を読み直さずに済ませる。
--
-- 列を足すだけで、既存のデータは変わりません。
-- 何度実行しても結果は同じです。

alter table shopping_items
  add column if not exists sources jsonb not null default '[]'::jsonb;

-- 確認：1行返れば追加されています。
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'shopping_items'
  and column_name = 'sources';
