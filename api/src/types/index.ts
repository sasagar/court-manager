// Cloudflare Workers環境の型定義
export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
}

// 施設
export interface Facility {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  created_at: number;
}

// スタッフ
export interface Staff {
  id: string;
  display_name: string;
  employee_id: string | null;
  color_code: string | null;
  phone: string | null;
  emergency_contact: string | null;
  user_id: string | null;
  hired_date: string | null;
  notes: string | null;
  is_active: number;
  created_at: number;
}

// コート
export interface Court {
  id: string;
  facility_id: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: number;
}

// セッションステータス
export type SessionStatus = 'available' | 'locking' | 'reserved' | 'in_use' | 'completed';

// コートセッション
export interface CourtSession {
  id: number;
  facility_id: string;
  court_id: string;
  court_name: string | null;
  plan_id: string | null;
  staff_id: string | null;
  customer_name: string | null;
  start_time: number | null;
  estimated_end_time: number | null;
  actual_end_time: number | null;
  status: SessionStatus;
  locked_by: string | null;
  locked_at: number | null;
  lock_expires_at: number | null;
  is_walkin: number;
  created_at: number;
  updated_at: number;
}

// シフト
export interface Shift {
  id: string;
  facility_id: string;
  staff_id: string;
  date: string;
  start_time: number;
  end_time: number;
  status: 'scheduled' | 'active' | 'completed';
  created_at: number;
  updated_at: number;
}

// アサインメントステータス
export type AssignmentStatus = 'scheduled' | 'active' | 'completed' | 'replaced';

// セッションアサインメント
export interface SessionAssignment {
  id: number;
  session_id: number;
  shift_id: string;
  scheduled_start_time: number;
  scheduled_end_time: number | null;
  actual_start_time: number | null;
  actual_end_time: number | null;
  status: AssignmentStatus;
  replaced_by: number | null;
  replaces: number | null;
  handover_note: string | null;
  assigned_by: string | null;
  assigned_at: number;
}

// スタッフ稼働状況
export interface StaffActivity {
  staff_id: string;
  facility_id: string;
  current_session_id: number | null;
  status: 'idle' | 'busy' | 'break';
  last_updated: number;
}

// SSEイベントタイプ
export type SSEEventType =
  | 'INITIAL'
  | 'COURT_LOCKED'
  | 'COURT_RESERVED'
  | 'COURT_UNLOCKED'
  | 'SESSION_STARTED'
  | 'SESSION_COMPLETED'
  | 'STAFF_ASSIGNED'
  | 'STAFF_UNASSIGNED'
  | 'HANDOVER_SCHEDULED'
  | 'HANDOVER_EXECUTED'
  | 'STAFF_STATUS_CHANGED';

// ユーザーロール
export type UserRole = 'admin' | 'staff' | 'viewer';
