-- Court Management System - Initial Schema
-- Better Auth tables + Application tables

-- ============================================
-- Better Auth Tables
-- ============================================

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  email_verified INTEGER DEFAULT 0,
  image TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  id_token TEXT,
  password TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- ============================================
-- Application Tables
-- ============================================

-- 施設
CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  address TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- スタッフマスタ
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  employee_id TEXT UNIQUE,
  color_code TEXT,
  phone TEXT,
  emergency_contact TEXT,
  user_id TEXT UNIQUE,
  hired_date TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL
);

-- スタッフと施設の関連（多対多）
CREATE TABLE IF NOT EXISTS staff_facilities (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(staff_id, facility_id),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
);

-- ユーザーと施設の関連（アクセス権限）
CREATE TABLE IF NOT EXISTS user_facilities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(user_id, facility_id),
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
);

-- コート
CREATE TABLE IF NOT EXISTS courts (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 4,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
);

-- プラン
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price INTEGER,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE
);

-- コートセッション
CREATE TABLE IF NOT EXISTS court_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  facility_id TEXT NOT NULL,
  court_id TEXT NOT NULL,
  plan_id TEXT,
  customer_name TEXT,
  customer_count INTEGER DEFAULT 1,
  start_time INTEGER,
  estimated_end_time INTEGER,
  actual_end_time INTEGER,
  status TEXT NOT NULL DEFAULT 'available',
  locked_by TEXT,
  locked_at INTEGER,
  lock_expires_at INTEGER,
  is_walkin INTEGER DEFAULT 1,
  notes TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL,
  FOREIGN KEY (locked_by) REFERENCES user(id) ON DELETE SET NULL
);

-- シフト
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  staff_id TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

-- セッションアサインメント（スタッフ担当）
CREATE TABLE IF NOT EXISTS session_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  shift_id TEXT NOT NULL,
  scheduled_start_time INTEGER NOT NULL,
  scheduled_end_time INTEGER,
  actual_start_time INTEGER,
  actual_end_time INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',
  replaced_by INTEGER,
  replaces INTEGER,
  handover_note TEXT,
  assigned_by TEXT,
  assigned_at INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (session_id) REFERENCES court_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by) REFERENCES session_assignments(id) ON DELETE SET NULL,
  FOREIGN KEY (replaces) REFERENCES session_assignments(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by) REFERENCES user(id) ON DELETE SET NULL
);

-- スタッフ稼働状況
CREATE TABLE IF NOT EXISTS staff_activity (
  staff_id TEXT PRIMARY KEY,
  facility_id TEXT NOT NULL,
  current_session_id INTEGER,
  status TEXT NOT NULL DEFAULT 'idle',
  last_updated INTEGER DEFAULT (unixepoch()),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
  FOREIGN KEY (current_session_id) REFERENCES court_sessions(id) ON DELETE SET NULL
);

-- ============================================
-- Indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_session_user_id ON session(user_id);
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id ON staff(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_facilities_staff_id ON staff_facilities(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_facilities_facility_id ON staff_facilities(facility_id);
CREATE INDEX IF NOT EXISTS idx_user_facilities_user_id ON user_facilities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_facilities_facility_id ON user_facilities(facility_id);
CREATE INDEX IF NOT EXISTS idx_courts_facility_id ON courts(facility_id);
CREATE INDEX IF NOT EXISTS idx_plans_facility_id ON plans(facility_id);
CREATE INDEX IF NOT EXISTS idx_court_sessions_facility_id ON court_sessions(facility_id);
CREATE INDEX IF NOT EXISTS idx_court_sessions_court_id ON court_sessions(court_id);
CREATE INDEX IF NOT EXISTS idx_court_sessions_status ON court_sessions(status);
CREATE INDEX IF NOT EXISTS idx_shifts_facility_id ON shifts(facility_id);
CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
CREATE INDEX IF NOT EXISTS idx_session_assignments_session_id ON session_assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_session_assignments_shift_id ON session_assignments(shift_id);

-- ============================================
-- Views
-- ============================================

-- 現在アクティブなアサインメント
CREATE VIEW IF NOT EXISTS current_assignments AS
SELECT
  sa.id,
  sa.session_id,
  sa.shift_id,
  sh.staff_id,
  st.display_name AS staff_name,
  st.color_code AS staff_color,
  sa.scheduled_start_time,
  sa.scheduled_end_time,
  sa.status,
  sa.handover_note
FROM session_assignments sa
JOIN shifts sh ON sa.shift_id = sh.id
JOIN staff st ON sh.staff_id = st.id
WHERE sa.status IN ('scheduled', 'active');

-- セッションのスタッフタイムライン
CREATE VIEW IF NOT EXISTS session_staff_timeline AS
SELECT
  sa.session_id,
  sa.id AS assignment_id,
  sa.scheduled_start_time,
  sa.scheduled_end_time,
  sa.actual_start_time,
  sa.actual_end_time,
  sa.status,
  sh.staff_id,
  st.display_name AS staff_name,
  st.color_code AS staff_color,
  sa.replaces AS previous_assignment_id,
  sa.replaced_by AS next_assignment_id,
  sa.handover_note
FROM session_assignments sa
JOIN shifts sh ON sa.shift_id = sh.id
JOIN staff st ON sh.staff_id = st.id
ORDER BY sa.session_id, sa.scheduled_start_time;
