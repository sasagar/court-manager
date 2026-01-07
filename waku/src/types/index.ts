// 施設
export interface Facility {
  id: string;
  name: string;
  slug: string;
  address: string | null;
}

// スタッフ
export interface Staff {
  id: string;
  display_name: string;
  employee_id: string | null;
  color_code: string | null;
  is_active: boolean;
}

// コート
export interface Court {
  id: string;
  facility_id: string;
  name: string;
  capacity: number;
  current_session?: CourtSession | null;
}

// セッションステータス
export type SessionStatus = 'available' | 'locking' | 'reserved' | 'in_use' | 'completed';

// コートセッション
export interface CourtSession {
  id: number;
  court_id: string;
  customer_name: string | null;
  start_time: number | null;
  estimated_end_time: number | null;
  status: SessionStatus;
  locked_by: string | null;
  locked_by_name: string | null;
  lock_expires_at: number | null;
  assignments: Assignment[];
}

// シフト
export interface Shift {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_color: string | null;
  date: string;
  start_time: number;
  end_time: number;
  status: 'scheduled' | 'active' | 'completed';
  current_session_count: number;
}

// アサインメント
export interface Assignment {
  id: number;
  session_id: number;
  shift_id: string;
  staff_id: string;
  staff_name: string;
  staff_color: string | null;
  scheduled_start_time: number;
  scheduled_end_time: number | null;
  status: 'scheduled' | 'active' | 'completed' | 'replaced';
  handover_note: string | null;
}

// SSEイベント
export type SSEEvent =
  | { type: 'INITIAL'; courts: Court[]; shifts: Shift[] }
  | { type: 'COURT_LOCKED'; courtId: string; lockedBy: string; lockedByName: string; expiresAt: number }
  | { type: 'COURT_UNLOCKED'; courtId: string }
  | { type: 'COURT_RESERVED'; courtId: string; session: CourtSession }
  | { type: 'SESSION_STARTED'; sessionId: number; courtId: string }
  | { type: 'SESSION_COMPLETED'; sessionId: number; courtId: string }
  | { type: 'STAFF_ASSIGNED'; sessionId: number; assignment: Assignment }
  | { type: 'STAFF_UNASSIGNED'; sessionId: number; assignmentId: number }
  | { type: 'HANDOVER_SCHEDULED'; sessionId: number; currentAssignmentId: number; newAssignment: Assignment }
  | { type: 'HANDOVER_EXECUTED'; sessionId: number; assignmentId: number }
  | { type: 'STAFF_STATUS_CHANGED'; staffId: string; status: 'idle' | 'busy' | 'break' };

// ユーザー
export interface User {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}
