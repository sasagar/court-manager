/**
 * APIクライアント
 *
 * コート管理システムのバックエンドAPIと通信するためのクライアントモジュール
 * 認証情報はCookieで自動的に送信される
 *
 * @module api-client
 */

/** APIベースURL */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

/**
 * リクエストオプション
 */
interface RequestOptions {
  /** HTTPメソッド */
  method?: string;
  /** リクエストボディ */
  body?: unknown;
  /** 追加ヘッダー */
  headers?: Record<string, string>;
}

/**
 * 汎用APIリクエスト関数
 *
 * @param endpoint - APIエンドポイント（/api/...）
 * @param options - リクエストオプション
 * @returns レスポンスデータ
 * @throws エラー時にErrorをスロー
 */
async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * ファイルアップロード用リクエスト関数
 *
 * @param endpoint - APIエンドポイント
 * @param formData - アップロードするFormData
 * @returns レスポンスデータ
 */
async function uploadRequest<T>(endpoint: string, formData: FormData): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * 施設API
 *
 * 施設の一覧取得、作成、更新を行う
 */
export const facilitiesApi = {
  list: () => request<{ facilities: Facility[] }>('/api/facilities'),
  get: (id: string) => request<{ facility: Facility; userRole: string }>(`/api/facilities/${id}`),
  create: (data: CreateFacilityInput) =>
    request<{ id: string }>('/api/facilities', { method: 'POST', body: data }),
  update: (id: string, data: UpdateFacilityInput) =>
    request<{ success: boolean }>(`/api/facilities/${id}`, { method: 'PATCH', body: data }),
};

/**
 * コートAPI
 *
 * コートの一覧取得、ステータス確認、作成、更新、削除を行う
 */
export const courtsApi = {
  list: (facilityId: string, includeInactive = false) =>
    request<{ courts: Court[] }>(
      `/api/facilities/${facilityId}/courts?includeInactive=${includeInactive}`
    ),
  getStatus: (facilityId: string) =>
    request<{ courts: CourtWithSession[] }>(`/api/facilities/${facilityId}/courts/status`),
  create: (facilityId: string, data: CreateCourtInput) =>
    request<{ id: string }>(`/api/facilities/${facilityId}/courts`, { method: 'POST', body: data }),
  update: (facilityId: string, courtId: string, data: UpdateCourtInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/courts/${courtId}`, {
      method: 'PATCH',
      body: data,
    }),
  delete: (facilityId: string, courtId: string) =>
    request<{ success: boolean; deactivated?: boolean }>(
      `/api/facilities/${facilityId}/courts/${courtId}`,
      { method: 'DELETE' }
    ),
};

/**
 * セッションAPI
 *
 * コートの予約・使用セッションを管理する
 * ロック → 予約 → 開始 → 完了 のフローを制御
 */
export const sessionsApi = {
  get: (facilityId: string, sessionId: string) =>
    request<{ session: SessionDetail }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}`
    ),
  lock: (facilityId: string, courtId: string) =>
    request<{ sessionId: string; expiresAt: number }>(
      `/api/facilities/${facilityId}/courts/${courtId}/lock`,
      { method: 'POST' }
    ),
  unlock: (facilityId: string, sessionId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/sessions/${sessionId}/unlock`, {
      method: 'POST',
    }),
  reserve: (facilityId: string, sessionId: string, data: ReserveSessionInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/sessions/${sessionId}/reserve`, {
      method: 'POST',
      body: data,
    }),
  start: (facilityId: string, sessionId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/sessions/${sessionId}/start`, {
      method: 'POST',
    }),
  complete: (facilityId: string, sessionId: string, data?: CompleteSessionInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/sessions/${sessionId}/complete`, {
      method: 'POST',
      body: data,
    }),
  getTimeline: (facilityId: string, sessionId: string) =>
    request<{ timeline: TimelineEntry[] }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/timeline`
    ),
  createSlot: (facilityId: string, courtId: string, data: CreateSlotInput) =>
    request<{ sessionId: number; planName: string; maxCapacity: number }>(
      `/api/facilities/${facilityId}/courts/${courtId}/create-slot`,
      { method: 'POST', body: data }
    ),
  addBooking: (facilityId: string, sessionId: string, data: AddBookingInput) =>
    request<{ success: boolean; newCount: number; maxCapacity: number }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/add-booking`,
      { method: 'POST', body: data }
    ),
  updateCount: (facilityId: string, sessionId: string, data: UpdateCountInput) =>
    request<{ success: boolean; newCount: number; maxCapacity: number }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/update-count`,
      { method: 'PATCH', body: data }
    ),
  updateCapacity: (facilityId: string, sessionId: string, maxCapacity: number) =>
    request<{ success: boolean; maxCapacity: number; currentCount: number }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/update-capacity`,
      { method: 'PATCH', body: { maxCapacity } }
    ),
  cancel: (facilityId: string, sessionId: string) =>
    request<{ success: boolean }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}`,
      { method: 'DELETE' }
    ),
  updateTime: (facilityId: string, sessionId: string, startTime: number, estimatedEndTime: number) =>
    request<{ success: boolean }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/time`,
      { method: 'PATCH', body: { startTime, estimatedEndTime } }
    ),
  updatePaymentStatus: (facilityId: string, sessionId: string, paymentStatus: 'paid' | 'unpaid') =>
    request<{ success: boolean; paymentStatus: 'paid' | 'unpaid' }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/payment-status`,
      { method: 'PATCH', body: { paymentStatus } }
    ),
  update: (facilityId: string, sessionId: string, data: UpdateSessionInput) =>
    request<{ success: boolean; session: UpdatedSession }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}`,
      { method: 'PATCH', body: data }
    ),
  move: (facilityId: string, sessionId: string, targetCourtId: string) =>
    request<{ success: boolean; oldCourtId: string; newCourtId: string; newCourtName: string }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/move`,
      { method: 'PATCH', body: { targetCourtId } }
    ),
  swapCourts: (facilityId: string, sessionId1: string, sessionId2: string) =>
    request<{
      success: boolean;
      session1: { id: number; oldCourtId: string; newCourtId: string };
      session2: { id: number; oldCourtId: string; newCourtId: string };
    }>(
      `/api/facilities/${facilityId}/sessions/swap-courts`,
      { method: 'POST', body: { sessionId1, sessionId2 } }
    ),
};

/**
 * シフトAPI
 *
 * スタッフのシフトスケジュールを管理する
 */
export const shiftsApi = {
  listToday: (facilityId: string) =>
    request<{ shifts: Shift[] }>(`/api/facilities/${facilityId}/shifts/today`),
  list: (facilityId: string, params?: { date?: string; startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ shifts: Shift[] }>(`/api/facilities/${facilityId}/shifts?${query}`);
  },
  create: (facilityId: string, data: CreateShiftInput) =>
    request<{ id: string }>(`/api/facilities/${facilityId}/shifts`, { method: 'POST', body: data }),
  update: (facilityId: string, shiftId: string, data: UpdateShiftInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/shifts/${shiftId}`, {
      method: 'PATCH',
      body: data,
    }),
  delete: (facilityId: string, shiftId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/shifts/${shiftId}`, {
      method: 'DELETE',
    }),
};

/**
 * スタッフAPI
 *
 * スタッフの登録・更新・アクティビティ状態管理を行う
 */
export const staffApi = {
  list: (facilityId: string, includeInactive = false) =>
    request<{ staff: Staff[] }>(
      `/api/facilities/${facilityId}/staff?includeInactive=${includeInactive}`
    ),
  get: (facilityId: string, staffId: string) =>
    request<{ staff: Staff }>(`/api/facilities/${facilityId}/staff/${staffId}`),
  create: (facilityId: string, data: CreateStaffInput) =>
    request<{ id: string }>(`/api/facilities/${facilityId}/staff`, { method: 'POST', body: data }),
  update: (facilityId: string, staffId: string, data: UpdateStaffInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/staff/${staffId}`, {
      method: 'PATCH',
      body: data,
    }),
  updateStatus: (facilityId: string, staffId: string, status: 'idle' | 'busy' | 'break') =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/staff/${staffId}/status`, {
      method: 'POST',
      body: { status },
    }),
  delete: (facilityId: string, staffId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/staff/${staffId}`, {
      method: 'DELETE',
    }),
  reorder: (facilityId: string, staffIds: string[]) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/staff/reorder`, {
      method: 'PUT',
      body: { staffIds },
    }),
};

/**
 * 画像API
 *
 * スタッフ画像のアップロード・削除を行う
 */
export const imagesApi = {
  upload: (facilityId: string, file: File, type: 'staff' | 'user' | 'general' = 'general') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    return uploadRequest<{ url: string; key: string }>(
      `/api/facilities/${facilityId}/images/upload`,
      formData
    );
  },
  delete: (facilityId: string, key: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/images`, {
      method: 'DELETE',
      body: { key },
    }),
};

/**
 * アサインメントAPI
 *
 * セッションへのスタッフ割り当てを管理する
 */
export const assignmentsApi = {
  assign: (facilityId: string, sessionId: string, data: AssignInput) =>
    request<{ assignmentId: string }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/assign`,
      { method: 'POST', body: data }
    ),
  unassign: (facilityId: string, sessionId: string, shiftId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/sessions/${sessionId}/assign/${shiftId}`, {
      method: 'DELETE',
    }),
  scheduleHandover: (facilityId: string, assignmentId: string, data: ScheduleHandoverInput) =>
    request<{ newAssignmentId: string }>(
      `/api/facilities/${facilityId}/assignments/${assignmentId}/schedule-handover`,
      { method: 'POST', body: data }
    ),
  executeHandover: (facilityId: string, assignmentId: string, note?: string) =>
    request<{ success: boolean }>(
      `/api/facilities/${facilityId}/assignments/${assignmentId}/execute-handover`,
      { method: 'POST', body: { note } }
    ),
};

/**
 * プランAPI
 *
 * 料金プラン（通常プラン・枠プラン）を管理する
 */
export const plansApi = {
  list: (facilityId: string, includeInactive = false) =>
    request<{ plans: Plan[] }>(
      `/api/facilities/${facilityId}/plans?includeInactive=${includeInactive}`
    ),
  get: (facilityId: string, planId: string) =>
    request<{ plan: Plan }>(`/api/facilities/${facilityId}/plans/${planId}`),
  create: (facilityId: string, data: CreatePlanInput) =>
    request<{ id: string }>(`/api/facilities/${facilityId}/plans`, { method: 'POST', body: data }),
  update: (facilityId: string, planId: string, data: UpdatePlanInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/plans/${planId}`, {
      method: 'PATCH',
      body: data,
    }),
  delete: (facilityId: string, planId: string) =>
    request<{ success: boolean; deactivated?: boolean; deleted?: boolean }>(
      `/api/facilities/${facilityId}/plans/${planId}`,
      { method: 'DELETE' }
    ),
  reorder: (facilityId: string, planIds: string[]) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/plans/reorder`, {
      method: 'PUT',
      body: { planIds },
    }),
  duplicate: (facilityId: string, planId: string) =>
    request<{ id: string }>(`/api/facilities/${facilityId}/plans/${planId}/duplicate`, {
      method: 'POST',
    }),
  deactivate: (facilityId: string, planId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/plans/${planId}/deactivate`, {
      method: 'POST',
    }),
  activate: (facilityId: string, planId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/plans/${planId}/activate`, {
      method: 'POST',
    }),
};

/**
 * プランオプションAPI
 *
 * プランに付随するオプション（機材レンタル等）を管理する
 */
export const planOptionsApi = {
  list: (facilityId: string, planId: string, includeInactive = false) =>
    request<{ options: PlanOption[] }>(
      `/api/facilities/${facilityId}/plans/${planId}/options?includeInactive=${includeInactive}`
    ),
  create: (facilityId: string, planId: string, data: CreatePlanOptionInput) =>
    request<{ id: string }>(`/api/facilities/${facilityId}/plans/${planId}/options`, {
      method: 'POST',
      body: data,
    }),
  update: (facilityId: string, planId: string, optionId: string, data: UpdatePlanOptionInput) =>
    request<{ success: boolean }>(
      `/api/facilities/${facilityId}/plans/${planId}/options/${optionId}`,
      { method: 'PATCH', body: data }
    ),
  delete: (facilityId: string, planId: string, optionId: string) =>
    request<{ success: boolean; deactivated?: boolean }>(
      `/api/facilities/${facilityId}/plans/${planId}/options/${optionId}`,
      { method: 'DELETE' }
    ),
  reorder: (facilityId: string, planId: string, optionIds: string[]) =>
    request<{ success: boolean }>(
      `/api/facilities/${facilityId}/plans/${planId}/options/reorder`,
      { method: 'PUT', body: { optionIds } }
    ),
};

/**
 * セッションオプションAPI
 *
 * セッションに適用されたオプションを管理する
 */
export const sessionOptionsApi = {
  list: (facilityId: string, sessionId: string) =>
    request<{ options: SessionOption[] }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/options`
    ),
  update: (facilityId: string, sessionId: string, options: Array<{ optionId: string; quantity: number }>) =>
    request<{ success: boolean }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/options`,
      { method: 'PUT', body: { options } }
    ),
};

// Types
export type Facility = {
  id: string;
  name: string;
  timezone?: string;
  address?: string;
  role?: string;
  businessStartHour?: number;
  businessEndHour?: number;
};

export type Court = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type CourtWithSession = Court & {
  currentSession: Session | null;
  sessions?: Session[]; // 同じコートに複数のセッションがある場合
};

export type SessionBooking = {
  id: number;
  customerName: string;
  customerCount: number;
  paymentStatus: 'paid' | 'unpaid';
};

export type Session = {
  id: string;
  customerName: string;
  customerCount: number;
  startTime: number;
  estimatedEndTime: number;
  status: 'locking' | 'reserved' | 'in_use' | 'completed';
  lockedBy?: string;
  lockedByName?: string;
  lockExpiresAt?: number;
  planId?: string;
  planName?: string;
  planShortName?: string;
  isSlotBased?: boolean;
  maxCapacity?: number;
  displayColor?: string;
  memo?: string;
  paymentStatus?: 'paid' | 'unpaid';
  assignments: Assignment[];
  options?: SessionOption[];
  bookings?: SessionBooking[];
};

export type ShiftAssignedSession = {
  assignmentId: number;
  sessionId: number;
  courtId: string;
  courtName: string;
  customerName?: string;
  sessionStartTime: number;
  sessionEndTime?: number;
  sessionStatus: string;
  displayColor?: string;
  planName?: string;
  planShortName?: string;
  assignmentStatus: string;
  scheduledStartTime: number;
  scheduledEndTime?: number;
};

export type ScheduledBreak = {
  id: number;
  shiftId: string;
  staffId?: string;
  staffName?: string;
  startTime: number;
  endTime: number;
  memo?: string;
};

export type Shift = {
  id: string;
  staffId: string;
  staffName: string;
  staffColor: string;
  staffImageUrl?: string;
  date: string;
  startTime: number;
  endTime: number;
  status: 'scheduled' | 'active' | 'completed';
  activityStatus?: 'idle' | 'busy' | 'break';
  currentSessionId?: string;
  notes?: string;
  assignedSessions?: ShiftAssignedSession[];
  scheduledBreaks?: ScheduledBreak[];
};

export type Staff = {
  id: string;
  displayName: string;
  employeeId?: string;
  colorCode?: string;
  phone?: string;
  userId?: string;
  imageUrl?: string;
  isActive: boolean;
  role: 'admin' | 'staff' | 'viewer';
  sortOrder: number;
  activityStatus?: 'idle' | 'busy' | 'break';
  currentSessionId?: string;
};

export type Assignment = {
  id: string;
  sessionId: string;
  shiftId: string;
  staffId: string;
  staffName: string;
  staffColor: string;
  scheduledStartTime: number;
  scheduledEndTime: number;
  status: 'scheduled' | 'active' | 'completed';
  handoverNote?: string;
};

export type TimelineEntry = {
  timestamp: number;
  action: string;
  actorName?: string;
  details?: string;
};

// Input types
export type CreateFacilityInput = { name: string; slug?: string; timezone?: string; address?: string };
export type UpdateFacilityInput = { name?: string; address?: string; businessStartHour?: number; businessEndHour?: number };
export type CreateCourtInput = { name: string; sortOrder?: number };
export type UpdateCourtInput = Partial<CreateCourtInput> & { isActive?: boolean };
export type ReserveSessionInput = {
  customerName?: string;
  customerCount: number;
  planId?: string;
  estimatedEndTime?: number;
  maxCapacity?: number;
  displayColor?: string;
  memo?: string;
  paymentStatus?: 'paid' | 'unpaid';
};
export type CompleteSessionInput = { actualRevenue?: number; notes?: string };
export type CreateShiftInput = {
  staffId: string;
  date: string;
  startTime: number;
  endTime: number;
  notes?: string;
};
export type UpdateShiftInput = {
  startTime?: number;
  endTime?: number;
  status?: 'scheduled' | 'active' | 'completed';
  notes?: string;
};
export type CreateStaffInput = {
  displayName: string;
  employeeId?: string;
  colorCode?: string;
  phone?: string;
  imageUrl?: string;
  role?: 'admin' | 'staff' | 'viewer';
};
export type UpdateStaffInput = Partial<CreateStaffInput> & {
  isActive?: boolean;
  userId?: string | null;
  imageUrl?: string | null;
};
export type AssignInput = { shiftId: string; scheduledEndTime?: number };
export type ScheduleHandoverInput = { nextShiftId: string; handoverTime: number; note?: string };
export type CreateSlotInput = {
  planId: string;
  startTime: number;
  estimatedEndTime: number;
  maxCapacity?: number;
};
export type AddBookingInput = {
  customerName?: string;
  customerCount?: number;
};
export type UpdateCountInput = {
  customerCount: number;
  customerName?: string;
};
export type UpdateSessionInput = {
  customerName?: string;
  customerCount?: number;
  startTime?: number;
  estimatedEndTime?: number;
  memo?: string;
};
export type UpdatedSession = {
  customerName?: string;
  customerCount: number;
  startTime: number;
  estimatedEndTime?: number;
  memo?: string;
};
export type CreatePlanInput = {
  name: string;
  shortName?: string;
  durationMinutes: number;
  description?: string;
  sortOrder?: number;
  isSlotBased?: boolean;
  maxCapacity?: number;
  colorCode?: string;
};
export type UpdatePlanInput = Partial<CreatePlanInput> & { isActive?: boolean };
export type CreateBookingInput = {
  customerName: string;
  customerCount: number;
  customerPhone?: string;
  notes?: string;
  paymentStatus?: 'paid' | 'unpaid';
};
export type UpdateBookingInput = Partial<CreateBookingInput> & {
  status?: 'confirmed' | 'cancelled';
};

export type Plan = {
  id: string;
  name: string;
  shortName?: string;
  durationMinutes: number;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  isSlotBased: boolean;
  maxCapacity?: number;
  colorCode?: string;
  createdAt: string;
};

export type PlanOption = {
  id: string;
  planId: string;
  name: string;
  description?: string;
  price: number;
  sortOrder: number;
  isActive: boolean;
  isRequired: boolean;
  allowMultiple: boolean;
  selectionType: 'quantity' | 'checkbox' | 'radio';
  optionGroup?: string;
  createdAt: string;
};

export type SessionOption = {
  id: number;
  optionId: string;
  optionName: string;
  optionPrice: number;
  quantity: number;
};

export type SessionDetailAssignment = {
  id: number;
  shiftId: string;
  staffId: string;
  staffName: string;
  staffColor?: string;
  scheduledStartTime: number;
  scheduledEndTime?: number;
  status: string;
  handoverNote?: string;
};

export type SessionDetail = {
  id: string;
  courtId: string;
  courtName: string;
  planId?: string;
  planName?: string;
  customerName?: string;
  customerCount: number;
  startTime: number;
  estimatedEndTime?: number;
  status: string;
  memo?: string;
  displayColor?: string;
  isSlotBased: boolean;
  maxCapacity?: number;
  paymentStatus: 'paid' | 'unpaid';
  createdAt: number;
  options: Array<{
    optionId: string;
    optionName: string;
    quantity: number;
    selectionType?: 'quantity' | 'checkbox' | 'radio';
  }>;
  assignments?: SessionDetailAssignment[];
};

export type CreatePlanOptionInput = {
  name: string;
  description?: string;
  price?: number;
  sortOrder?: number;
  isRequired?: boolean;
  allowMultiple?: boolean;
  selectionType?: 'quantity' | 'checkbox' | 'radio';
  optionGroup?: string;
};

export type UpdatePlanOptionInput = Partial<CreatePlanOptionInput> & { isActive?: boolean };

export type Booking = {
  id: number;
  sessionId: number;
  customerName: string;
  customerCount: number;
  customerPhone?: string;
  notes?: string;
  status: 'confirmed' | 'cancelled';
  paymentStatus: 'paid' | 'unpaid';
  createdAt: number;
  updatedAt: number;
};

// Bookings API (for slot-based plans)
export const bookingsApi = {
  list: (facilityId: string, sessionId: string) =>
    request<{ bookings: Booking[] }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/bookings`
    ),
  create: (facilityId: string, sessionId: string, data: CreateBookingInput) =>
    request<{ id: number; totalCount: number; available: number }>(
      `/api/facilities/${facilityId}/sessions/${sessionId}/bookings`,
      { method: 'POST', body: data }
    ),
  update: (facilityId: string, bookingId: number, data: UpdateBookingInput) =>
    request<{ success: boolean; totalCount: number; available: number }>(
      `/api/facilities/${facilityId}/bookings/${bookingId}`,
      { method: 'PATCH', body: data }
    ),
  delete: (facilityId: string, bookingId: number) =>
    request<{ success: boolean; totalCount: number; available: number }>(
      `/api/facilities/${facilityId}/bookings/${bookingId}`,
      { method: 'DELETE' }
    ),
  updatePaymentStatus: (facilityId: string, bookingId: number, paymentStatus: 'paid' | 'unpaid') =>
    request<{ success: boolean; totalCount: number; available: number }>(
      `/api/facilities/${facilityId}/bookings/${bookingId}`,
      { method: 'PATCH', body: { paymentStatus } }
    ),
};

/**
 * コートブロックAPI
 *
 * コートの利用不可時間帯（メンテナンス等）を管理する
 */
export type CourtBlock = {
  id: string;
  facilityId: string;
  courtId?: string;
  courtName?: string;
  date?: string;
  dayOfWeek?: number;
  startTime: number;
  endTime: number;
  reason?: string;
  blockType: 'manual' | 'maintenance' | 'closed';
  isActive: boolean;
  createdAt: number;
  createdBy?: string;
  createdByName?: string;
};

export type CreateCourtBlockInput = {
  courtId?: string;
  date?: string;
  dayOfWeek?: number;
  startTime: number;
  endTime: number;
  reason?: string;
  blockType?: 'manual' | 'maintenance' | 'closed';
};

export type UpdateCourtBlockInput = Partial<CreateCourtBlockInput> & { isActive?: boolean };

export const courtBlocksApi = {
  list: (facilityId: string, params?: { date?: string; courtId?: string; includeRecurring?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.courtId) query.set('courtId', params.courtId);
    if (params?.includeRecurring !== undefined) query.set('includeRecurring', String(params.includeRecurring));
    const queryString = query.toString();
    return request<{ blocks: CourtBlock[] }>(
      `/api/facilities/${facilityId}/court-blocks${queryString ? `?${queryString}` : ''}`
    );
  },
  create: (facilityId: string, data: CreateCourtBlockInput) =>
    request<{ id: string }>(`/api/facilities/${facilityId}/court-blocks`, { method: 'POST', body: data }),
  update: (facilityId: string, blockId: string, data: UpdateCourtBlockInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/court-blocks/${blockId}`, {
      method: 'PATCH',
      body: data,
    }),
  delete: (facilityId: string, blockId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/court-blocks/${blockId}`, {
      method: 'DELETE',
    }),
};

/**
 * 予定休憩API
 *
 * スタッフのシフト内休憩時間を管理する
 */
export type CreateScheduledBreakInput = {
  shiftId: string;
  startTime: number;
  endTime: number;
  memo?: string;
};

export type UpdateScheduledBreakInput = {
  startTime?: number;
  endTime?: number;
  memo?: string;
};

export const breaksApi = {
  list: (facilityId: string, date?: string) => {
    const query = date ? `?date=${date}` : '';
    return request<{ breaks: ScheduledBreak[] }>(
      `/api/facilities/${facilityId}/breaks${query}`
    );
  },
  create: (facilityId: string, data: CreateScheduledBreakInput) =>
    request<{ id: number }>(`/api/facilities/${facilityId}/breaks`, {
      method: 'POST',
      body: data,
    }),
  update: (facilityId: string, breakId: number, data: UpdateScheduledBreakInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/breaks/${breakId}`, {
      method: 'PUT',
      body: data,
    }),
  delete: (facilityId: string, breakId: number) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/breaks/${breakId}`, {
      method: 'DELETE',
    }),
};

/**
 * ユーザーAPI
 *
 * 施設へのユーザーアクセス権限を管理する
 */
export type User = {
  id: string;
  name: string;
  email: string;
  image?: string;
  createdAt: number;
  role: 'admin' | 'staff' | 'viewer';
  staffId?: string;
  staffDisplayName?: string;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image?: string;
};

export type LinkedStaff = {
  id: string;
  displayName: string;
  employeeId?: string;
  colorCode?: string;
  phone?: string;
};

export type CreateUserInput = {
  email: string;
  name: string;
  password: string;
  role?: 'admin' | 'staff' | 'viewer';
};

export type UpdateUserInput = {
  role?: 'admin' | 'staff' | 'viewer';
  staffId?: string | null;
};

export type UpdateProfileInput = {
  name?: string;
  image?: string;
};

export const usersApi = {
  // 現在のユーザー情報
  getMe: () =>
    request<{ user: CurrentUser; staff: LinkedStaff | null }>('/api/users/me'),
  updateMe: (data: UpdateProfileInput) =>
    request<{ success: boolean }>('/api/users/me', { method: 'PATCH', body: data }),

  // 施設のユーザー管理
  list: (facilityId: string) =>
    request<{ users: User[] }>(`/api/facilities/${facilityId}/users`),
  create: (facilityId: string, data: CreateUserInput) =>
    request<{ id: string }>(`/api/facilities/${facilityId}/users`, { method: 'POST', body: data }),
  update: (facilityId: string, userId: string, data: UpdateUserInput) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/users/${userId}`, {
      method: 'PATCH',
      body: data,
    }),
  delete: (facilityId: string, userId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/users/${userId}`, {
      method: 'DELETE',
    }),
};

/**
 * セットアップAPI
 *
 * 初回セットアップ処理を行う
 */
export const setupApi = {
  getStatus: () =>
    request<{ hasUsers: boolean; hasFacilities: boolean; isSetupComplete: boolean }>(
      '/api/setup/status'
    ),
  initialize: (data: { userId: string; facilityName: string; facilitySlug?: string }) =>
    request<{ success: boolean; facilityId: string; message: string }>(
      '/api/setup/initialize',
      { method: 'POST', body: data }
    ),
};

// Public View API (認証不要のビュー用)
export type PublicViewData = {
  facility: {
    id: string;
    name: string;
    businessHoursStart: number | null;
    businessHoursEnd: number | null;
  };
  date: string;
  courts: Array<{
    id: string;
    name: string;
    sortOrder: number;
  }>;
  sessions: Array<{
    id: string;
    courtId: string;
    status: string;
    startTime: number;
    endTime: number | null;
    customerName: string | null;
    partySize: number | null;
    planId: string | null;
    planName: string | null;
    planShortName: string | null;
    planColor: string | null;
  }>;
  shifts: Array<{
    id: string;
    staffId: string;
    staffName: string;
    staffColor: string | null;
    staffImageUrl: string | null;
    startTime: number;
    endTime: number;
    status: string;
  }>;
  breaks: Array<{
    id: string;
    staffId: string;
    staffName: string;
    staffColor: string | null;
    startTime: number;
    endTime: number;
  }>;
  blocks: Array<{
    id: string;
    courtId: string | null;
    courtName: string | null;
    startTime: number;
    endTime: number;
    reason: string | null;
    blockType: string;
  }>;
};

/**
 * 公開ビューAPI
 *
 * 認証不要の公開ビュー機能を提供する
 * トークンベースでコート状況やシフトを閲覧可能
 */
export const publicViewApi = {
  /** トークン取得（認証必要） */
  getToken: (facilityId: string) =>
    request<{ token: string | null }>(`/api/facilities/${facilityId}/public-view/token`),
  generateToken: (facilityId: string) =>
    request<{ token: string }>(`/api/facilities/${facilityId}/public-view/generate-token`, {
      method: 'POST',
    }),
  revokeToken: (facilityId: string) =>
    request<{ success: boolean }>(`/api/facilities/${facilityId}/public-view/token`, {
      method: 'DELETE',
    }),

  // 公開データ取得（認証不要）
  getData: (token: string, date?: string) => {
    const url = date
      ? `${API_URL}/api/public-view/${token}?date=${date}`
      : `${API_URL}/api/public-view/${token}`;
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error('Invalid token');
      return res.json() as Promise<PublicViewData>;
    });
  },
};
