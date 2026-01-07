-- プランオプション機能
-- 通常予約（非枠プラン）に対して、複数選択肢から選べるオプションを追加

-- プランに紐づくオプション定義
CREATE TABLE IF NOT EXISTS plan_options (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

-- セッションで選択されたオプション
CREATE TABLE IF NOT EXISTS session_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  option_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (session_id) REFERENCES court_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (option_id) REFERENCES plan_options(id) ON DELETE CASCADE
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_plan_options_plan_id ON plan_options(plan_id);
CREATE INDEX IF NOT EXISTS idx_session_options_session_id ON session_options(session_id);
CREATE INDEX IF NOT EXISTS idx_session_options_option_id ON session_options(option_id);
