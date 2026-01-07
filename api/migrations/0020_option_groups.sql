-- オプショングループ機能
-- オプションをグループとして管理し、グループごとに単一選択/複数選択を設定可能にする

-- 1. option_groupsテーブル作成
CREATE TABLE IF NOT EXISTS option_groups (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  selection_type TEXT DEFAULT 'single',  -- 'single' (単一選択) | 'multiple' (複数選択)
  max_selections INTEGER,                -- 複数選択時の選択上限数（NULLは無制限）
  is_required INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_option_groups_plan_id ON option_groups(plan_id);

-- 2. plan_optionsにgroup_id列追加
ALTER TABLE plan_options ADD COLUMN group_id TEXT REFERENCES option_groups(id) ON DELETE SET NULL;

-- 3. 既存のoption_group値からグループを自動作成
-- 既存のユニークなoption_group値を取得し、各プランごとにグループを作成
INSERT INTO option_groups (id, plan_id, name, selection_type, is_required, sort_order, is_active)
SELECT
  lower(hex(randomblob(16))) as id,
  plan_id,
  option_group as name,
  CASE
    WHEN selection_type = 'radio' THEN 'single'
    ELSE 'multiple'
  END as selection_type,
  MAX(is_required) as is_required,
  MIN(sort_order) as sort_order,
  1 as is_active
FROM plan_options
WHERE option_group IS NOT NULL AND option_group != ''
GROUP BY plan_id, option_group;

-- 4. plan_optionsのgroup_idを更新
UPDATE plan_options
SET group_id = (
  SELECT og.id FROM option_groups og
  WHERE og.plan_id = plan_options.plan_id
  AND og.name = plan_options.option_group
)
WHERE option_group IS NOT NULL AND option_group != '';

-- 5. 不要になった列を削除するためテーブルを再作成
-- SQLiteではALTER TABLE DROP COLUMNが制限されているため

-- 5a. 新しいplan_optionsテーブルを作成（option_group, selection_type列なし）
CREATE TABLE plan_options_new (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  group_id TEXT REFERENCES option_groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  is_required INTEGER DEFAULT 0,
  allow_multiple INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- 5b. データを移行
INSERT INTO plan_options_new (id, plan_id, group_id, name, description, price, sort_order, is_active, is_required, allow_multiple, created_at)
SELECT id, plan_id, group_id, name, description, price, sort_order, is_active, is_required, allow_multiple, created_at
FROM plan_options;

-- 5c. 古いテーブルを削除して新しいテーブルをリネーム
DROP TABLE plan_options;
ALTER TABLE plan_options_new RENAME TO plan_options;

-- 5d. インデックスを再作成
CREATE INDEX IF NOT EXISTS idx_plan_options_plan_id ON plan_options(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_options_group_id ON plan_options(group_id);
