-- 施設の営業時間設定を追加
ALTER TABLE facilities ADD COLUMN business_start_hour INTEGER DEFAULT 9;
ALTER TABLE facilities ADD COLUMN business_end_hour INTEGER DEFAULT 22;

-- コートブロック（利用不可時間帯）テーブル
CREATE TABLE IF NOT EXISTS court_blocks (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  court_id TEXT, -- NULLの場合は全コート対象
  date TEXT, -- NULLの場合は繰り返し（曜日ベース）
  day_of_week INTEGER, -- 0-6 (日-土), dateがNULLの場合のみ使用
  start_time INTEGER NOT NULL, -- 開始時刻 (UNIX timestamp または時刻)
  end_time INTEGER NOT NULL, -- 終了時刻
  reason TEXT, -- ブロック理由（メンテナンス、営業時間外など）
  block_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'maintenance', 'closed'
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  created_by TEXT,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES user(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_court_blocks_facility_id ON court_blocks(facility_id);
CREATE INDEX IF NOT EXISTS idx_court_blocks_court_id ON court_blocks(court_id);
CREATE INDEX IF NOT EXISTS idx_court_blocks_date ON court_blocks(date);
