-- スタッフの予定休憩テーブル
CREATE TABLE IF NOT EXISTS scheduled_breaks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    memo TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    created_by TEXT REFERENCES user(id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_scheduled_breaks_shift ON scheduled_breaks(shift_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_breaks_facility ON scheduled_breaks(facility_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_breaks_time ON scheduled_breaks(start_time, end_time);
