'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CourtWithSession, Shift, Assignment, Session, ScheduledBreak } from '../lib/api-client';
import {
  sessionsApi,
  assignmentsApi,
  staffApi,
  type ReserveSessionInput,
  type CompleteSessionInput,
} from '../lib/api-client';

// sessionsとcurrentSessionを同期させるヘルパー関数
function updateCourtSessions(
  court: CourtWithSession,
  updateFn: (sessions: Session[]) => Session[]
): CourtWithSession {
  const currentSessions = court.sessions || (court.currentSession ? [court.currentSession] : []);
  const newSessions = updateFn(currentSessions);
  return {
    ...court,
    sessions: newSessions,
    currentSession: newSessions.length > 0 ? newSessions[0] : null,
  };
}

// セッションを追加するヘルパー
function addSession(sessions: Session[], newSession: Session): Session[] {
  // 既存のセッションがなければ追加
  const exists = sessions.some((s) => String(s.id) === String(newSession.id));
  if (exists) {
    return sessions.map((s) => String(s.id) === String(newSession.id) ? newSession : s);
  }
  return [...sessions, newSession].sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
}

// セッションを更新するヘルパー
function updateSession(sessions: Session[], sessionId: string, updateFn: (s: Session) => Session): Session[] {
  return sessions.map((s) => String(s.id) === String(sessionId) ? updateFn(s) : s);
}

// セッションを削除するヘルパー
function removeSession(sessions: Session[], sessionId: string): Session[] {
  return sessions.filter((s) => String(s.id) !== String(sessionId));
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';
const RECONNECT_DELAY = 3000;

type SSEEvent =
  | { type: 'INITIAL'; courts: CourtWithSession[]; shifts: ShiftWithActivity[] }
  | { type: 'HEARTBEAT' }
  | { type: 'COURT_LOCKED'; courtId: string; sessionId: string; lockedBy: string; lockedByName: string; expiresAt: number }
  | { type: 'COURT_UNLOCKED'; courtId: string; sessionId: string }
  | { type: 'COURT_RESERVED'; courtId: string; sessionId: string; customerName: string; customerCount: number; startTime: number; estimatedEndTime: number; displayColor?: string; planId?: string; planName?: string; paymentStatus?: 'paid' | 'unpaid' }
  | { type: 'SESSION_STARTED'; courtId: string; sessionId: string; startTime: number }
  | { type: 'SESSION_COMPLETED'; courtId: string; sessionId: string }
  | { type: 'SESSION_CANCELLED'; courtId: string; sessionId: string }
  | { type: 'SLOT_CREATED'; courtId: string; sessionId: string; planId: string; planName: string; startTime: number; estimatedEndTime: number; maxCapacity: number | null; customerCount: number; displayColor?: string; paymentStatus?: 'paid' | 'unpaid'; isSlotBased?: boolean }
  | { type: 'BOOKING_ADDED'; courtId: string; sessionId: string; booking?: { id: number; customerName: string; customerCount: number; paymentStatus: 'paid' | 'unpaid' }; customerName?: string; addedCount: number; newTotalCount: number; maxCapacity: number | null }
  | { type: 'BOOKING_REMOVED'; courtId: string; sessionId: string; bookingId: number; totalCount: number; maxCapacity: number | null; customerName?: string }
  | { type: 'BOOKING_UPDATED'; courtId: string; sessionId: string; bookingId: number; booking?: { id: number; customerName: string; customerCount: number; paymentStatus: 'paid' | 'unpaid' }; newCount: number; maxCapacity: number | null; customerName?: string }
  | { type: 'CAPACITY_UPDATED'; courtId: string; sessionId: string; maxCapacity: number; currentCount: number }
  | { type: 'SESSION_TIME_UPDATED'; courtId: string; sessionId: string; startTime: number; estimatedEndTime: number }
  | { type: 'PAYMENT_STATUS_UPDATED'; courtId: string; sessionId: number; paymentStatus: 'paid' | 'unpaid' }
  | { type: 'SESSION_UPDATED'; courtId: string; sessionId: number; customerName?: string; customerCount: number; startTime: number; estimatedEndTime?: number; memo?: string }
  | { type: 'SESSION_MOVED'; sessionId: number; oldCourtId: string; newCourtId: string; newCourtName: string }
  | { type: 'STAFF_ASSIGNED'; sessionId: string; assignment: Assignment; shiftId: string; assignmentId: number; sessionInfo?: {
      courtId: string;
      courtName: string;
      customerName?: string;
      sessionStartTime: number;
      sessionEndTime?: number;
      sessionStatus: string;
      displayColor?: string;
      planName?: string;
      planShortName?: string;
      scheduledStartTime: number;
      scheduledEndTime?: number;
    }}
  | { type: 'STAFF_UNASSIGNED'; sessionId: string; assignmentId: string; shiftId?: string }
  | { type: 'HANDOVER_SCHEDULED'; sessionId: string; currentAssignmentId: string; newAssignment: Assignment }
  | { type: 'HANDOVER_EXECUTED'; sessionId: string; previousAssignmentId: string; newAssignmentId: string }
  | { type: 'STAFF_STATUS_CHANGED'; staffId: string; status: 'idle' | 'busy' | 'break' }
  | { type: 'BREAK_CREATED'; breakData: { id: number; shiftId: string; staffId: string; staffName?: string; startTime: number; endTime: number; memo?: string } }
  | { type: 'BREAK_UPDATED'; breakData: { id: number; shiftId: string; staffId: string; startTime: number; endTime: number; memo?: string } }
  | { type: 'BREAK_DELETED'; breakId: number; shiftId: string; staffId: string };

type ShiftWithActivity = Shift & {
  activityStatus: 'idle' | 'busy' | 'break';
  currentSessionId?: string;
};

type LockAndReserveInput = ReserveSessionInput & { startTime?: number };

type UseRealtimeCourtsReturn = {
  courts: CourtWithSession[];
  shifts: ShiftWithActivity[];
  isConnected: boolean;
  error: string | null;
  // Operations
  lockCourt: (courtId: string) => Promise<{ sessionId: string; expiresAt: number }>;
  unlockSession: (sessionId: string) => Promise<void>;
  reserveSession: (sessionId: string, data: ReserveSessionInput) => Promise<void>;
  lockAndReserve: (courtId: string, data: LockAndReserveInput) => Promise<{ sessionId: string }>;
  startSession: (sessionId: string) => Promise<void>;
  completeSession: (sessionId: string, data?: CompleteSessionInput) => Promise<void>;
  cancelSession: (sessionId: string) => Promise<void>;
  assignStaff: (sessionId: string, shiftId: string, scheduledEndTime?: number) => Promise<string>;
  unassignStaff: (sessionId: string, shiftId: string) => Promise<void>;
  scheduleHandover: (assignmentId: string, nextShiftId: string, handoverTime: number, note?: string) => Promise<string>;
  executeHandover: (assignmentId: string, note?: string) => Promise<void>;
  updateStaffStatus: (staffId: string, status: 'idle' | 'busy' | 'break') => Promise<void>;
  swapCourts: (sessionId1: string, sessionId2: string) => Promise<void>;
};

export function useRealtimeCourts(facilityId: string | null, selectedDate?: string): UseRealtimeCourtsReturn {
  const [courts, setCourts] = useState<CourtWithSession[]>([]);
  const [shifts, setShifts] = useState<ShiftWithActivity[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const selectedDateRef = useRef(selectedDate);
  const isIntentionalDisconnectRef = useRef(false);

  // selectedDateRefを最新の値に更新
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  const handleEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case 'INITIAL':
        setCourts(event.courts);
        setShifts(event.shifts);
        break;

      case 'HEARTBEAT':
        // Connection alive
        break;

      case 'COURT_LOCKED':
        setCourts((prev) =>
          prev.map((court) =>
            court.id === event.courtId
              ? updateCourtSessions(court, (sessions) =>
                  addSession(sessions, {
                    id: event.sessionId,
                    customerName: '',
                    customerCount: 0,
                    startTime: 0,
                    estimatedEndTime: 0,
                    status: 'locking',
                    lockedBy: event.lockedBy,
                    lockedByName: event.lockedByName,
                    lockExpiresAt: event.expiresAt,
                    assignments: [],
                  })
                )
              : court
          )
        );
        break;

      case 'COURT_UNLOCKED':
        setCourts((prev) =>
          prev.map((court) =>
            court.id === event.courtId
              ? updateCourtSessions(court, (sessions) =>
                  removeSession(sessions, event.sessionId)
                )
              : court
          )
        );
        break;

      case 'COURT_RESERVED':
        setCourts((prev) =>
          prev.map((court) =>
            court.id === event.courtId
              ? updateCourtSessions(court, (sessions) =>
                  updateSession(sessions, event.sessionId, (s) => ({
                    ...s,
                    status: 'reserved',
                    customerName: event.customerName,
                    customerCount: event.customerCount,
                    startTime: event.startTime,
                    estimatedEndTime: event.estimatedEndTime,
                    displayColor: event.displayColor,
                    planId: event.planId,
                    planName: event.planName,
                    paymentStatus: event.paymentStatus || 'unpaid',
                    lockedBy: undefined,
                    lockedByName: undefined,
                    lockExpiresAt: undefined,
                  }))
                )
              : court
          )
        );
        break;

      case 'SESSION_STARTED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, event.sessionId, (s) => ({
                ...s,
                status: 'in_use',
                startTime: event.startTime,
              }))
            );
          })
        );
        break;

      case 'SESSION_COMPLETED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              removeSession(sessions, event.sessionId)
            );
          })
        );
        break;

      case 'SESSION_CANCELLED':
        setCourts((prev) =>
          prev.map((court) =>
            court.id === event.courtId
              ? updateCourtSessions(court, (sessions) =>
                  removeSession(sessions, event.sessionId)
                )
              : court
          )
        );
        break;

      case 'SLOT_CREATED':
        setCourts((prev) =>
          prev.map((court) =>
            court.id === event.courtId
              ? updateCourtSessions(court, (sessions) =>
                  addSession(sessions, {
                    id: String(event.sessionId),
                    customerName: '',
                    customerCount: event.customerCount,
                    startTime: event.startTime,
                    estimatedEndTime: event.estimatedEndTime,
                    status: 'reserved',
                    planId: event.planId,
                    planName: event.planName,
                    isSlotBased: true,
                    maxCapacity: event.maxCapacity ?? undefined,
                    displayColor: event.displayColor,
                    paymentStatus: event.paymentStatus || 'unpaid',
                    assignments: [],
                    bookings: [],
                  })
                )
              : court
          )
        );
        break;

      case 'BOOKING_ADDED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, String(event.sessionId), (s) => {
                const newBookings = s.bookings || [];
                // booking情報がある場合は配列に追加
                if (event.booking) {
                  const exists = newBookings.some((b) => b.id === event.booking!.id);
                  if (!exists) {
                    newBookings.push(event.booking);
                  }
                }
                return {
                  ...s,
                  customerCount: event.newTotalCount,
                  customerName: event.customerName || s.customerName,
                  bookings: newBookings,
                };
              })
            );
          })
        );
        break;

      case 'BOOKING_UPDATED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, String(event.sessionId), (s) => {
                let updatedBookings = s.bookings || [];
                // booking情報がある場合は該当のbookingを更新
                if (event.booking && event.bookingId) {
                  updatedBookings = updatedBookings.map((b) =>
                    b.id === event.bookingId ? event.booking! : b
                  );
                }
                return {
                  ...s,
                  customerCount: event.newCount,
                  customerName: event.customerName !== undefined ? event.customerName : s.customerName,
                  bookings: updatedBookings,
                };
              })
            );
          })
        );
        break;

      case 'BOOKING_REMOVED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, String(event.sessionId), (s) => ({
                ...s,
                customerCount: event.totalCount,
                customerName: event.customerName ?? '',
                bookings: (s.bookings || []).filter((b) => b.id !== event.bookingId),
              }))
            );
          })
        );
        break;

      case 'CAPACITY_UPDATED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, String(event.sessionId), (s) => ({
                ...s,
                maxCapacity: event.maxCapacity,
              }))
            );
          })
        );
        break;

      case 'SESSION_TIME_UPDATED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, String(event.sessionId), (s) => ({
                ...s,
                startTime: event.startTime,
                estimatedEndTime: event.estimatedEndTime,
              }))
            );
          })
        );
        break;

      case 'PAYMENT_STATUS_UPDATED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, String(event.sessionId), (s) => ({
                ...s,
                paymentStatus: event.paymentStatus,
              }))
            );
          })
        );
        break;

      case 'SESSION_UPDATED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;

            // 日付が変更されて現在表示中の日付範囲外になった場合はセッションを削除
            if (selectedDateRef.current && event.startTime) {
              const eventDate = new Date(event.startTime * 1000);
              const eventDateStr = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
              if (eventDateStr !== selectedDateRef.current) {
                // 日付が変わったのでこの日のタイムラインからは削除
                return updateCourtSessions(court, (sessions) =>
                  removeSession(sessions, String(event.sessionId))
                );
              }
            }

            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, String(event.sessionId), (s) => ({
                ...s,
                customerName: event.customerName ?? s.customerName,
                customerCount: event.customerCount,
                startTime: event.startTime,
                estimatedEndTime: event.estimatedEndTime ?? s.estimatedEndTime,
                memo: event.memo,
              }))
            );
          })
        );
        break;

      case 'SESSION_MOVED':
        // セッションを古いコートから削除して、新しいコートに追加
        setCourts((prev) => {
          // まず古いコートからセッションを見つけて削除
          let movedSession: Session | null = null;
          const courtsWithoutSession = prev.map((court) => {
            if (court.id === event.oldCourtId) {
              const session = court.sessions?.find((s) => String(s.id) === String(event.sessionId));
              if (session) {
                movedSession = session;
              }
              return updateCourtSessions(court, (sessions) =>
                removeSession(sessions, String(event.sessionId))
              );
            }
            return court;
          });

          // 新しいコートにセッションを追加
          if (movedSession) {
            return courtsWithoutSession.map((court) => {
              if (court.id === event.newCourtId) {
                return updateCourtSessions(court, (sessions) =>
                  addSession(sessions, movedSession!)
                );
              }
              return court;
            });
          }
          return courtsWithoutSession;
        });
        break;

      case 'STAFF_ASSIGNED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, event.sessionId, (s) => ({
                ...s,
                assignments: [...s.assignments, event.assignment],
              }))
            );
          })
        );
        // シフトのassignedSessionsも更新
        if (event.shiftId && event.sessionInfo) {
          setShifts((prev) =>
            prev.map((shift) => {
              if (shift.id !== event.shiftId) return shift;
              const newAssignedSession = {
                assignmentId: event.assignmentId,
                sessionId: Number(event.sessionId),
                courtId: event.sessionInfo!.courtId,
                courtName: event.sessionInfo!.courtName,
                customerName: event.sessionInfo!.customerName,
                sessionStartTime: event.sessionInfo!.sessionStartTime,
                sessionEndTime: event.sessionInfo!.sessionEndTime,
                sessionStatus: event.sessionInfo!.sessionStatus,
                displayColor: event.sessionInfo!.displayColor,
                planName: event.sessionInfo!.planName,
                planShortName: event.sessionInfo!.planShortName,
                assignmentStatus: 'scheduled',
                scheduledStartTime: event.sessionInfo!.scheduledStartTime,
                scheduledEndTime: event.sessionInfo!.scheduledEndTime,
              };
              return {
                ...shift,
                assignedSessions: [...(shift.assignedSessions || []), newAssignedSession],
              };
            })
          );
        }
        break;

      case 'STAFF_UNASSIGNED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, event.sessionId, (s) => ({
                ...s,
                assignments: s.assignments.filter((a) => a.id !== event.assignmentId),
              }))
            );
          })
        );
        // シフトのassignedSessionsも更新
        if (event.shiftId) {
          setShifts((prev) =>
            prev.map((shift) => {
              if (shift.id !== event.shiftId) return shift;
              return {
                ...shift,
                assignedSessions: (shift.assignedSessions || []).filter(
                  (s) => String(s.sessionId) !== String(event.sessionId)
                ),
              };
            })
          );
        }
        break;

      case 'HANDOVER_SCHEDULED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, event.sessionId, (s) => ({
                ...s,
                assignments: [...s.assignments, event.newAssignment],
              }))
            );
          })
        );
        break;

      case 'HANDOVER_EXECUTED':
        setCourts((prev) =>
          prev.map((court) => {
            const hasSession = court.sessions?.some((s) => String(s.id) === String(event.sessionId));
            if (!hasSession) return court;
            return updateCourtSessions(court, (sessions) =>
              updateSession(sessions, event.sessionId, (s) => ({
                ...s,
                assignments: s.assignments.map((a) =>
                  a.id === event.previousAssignmentId
                    ? { ...a, status: 'completed' as const }
                    : a.id === event.newAssignmentId
                      ? { ...a, status: 'active' as const }
                      : a
                ),
              }))
            );
          })
        );
        break;

      case 'STAFF_STATUS_CHANGED':
        setShifts((prev) =>
          prev.map((shift) =>
            shift.staffId === event.staffId
              ? { ...shift, activityStatus: event.status }
              : shift
          )
        );
        break;

      case 'BREAK_CREATED':
        setShifts((prev) =>
          prev.map((shift) => {
            if (shift.id !== event.breakData.shiftId) return shift;
            const newBreak: ScheduledBreak = {
              id: event.breakData.id,
              shiftId: event.breakData.shiftId,
              staffId: event.breakData.staffId,
              staffName: event.breakData.staffName,
              startTime: event.breakData.startTime,
              endTime: event.breakData.endTime,
              memo: event.breakData.memo,
            };
            return {
              ...shift,
              scheduledBreaks: [...(shift.scheduledBreaks || []), newBreak],
            };
          })
        );
        break;

      case 'BREAK_UPDATED':
        setShifts((prev) =>
          prev.map((shift) => {
            if (shift.id !== event.breakData.shiftId) return shift;
            return {
              ...shift,
              scheduledBreaks: (shift.scheduledBreaks || []).map((b) =>
                b.id === event.breakData.id
                  ? {
                      ...b,
                      startTime: event.breakData.startTime,
                      endTime: event.breakData.endTime,
                      memo: event.breakData.memo,
                    }
                  : b
              ),
            };
          })
        );
        break;

      case 'BREAK_DELETED':
        setShifts((prev) =>
          prev.map((shift) => {
            if (shift.id !== event.shiftId) return shift;
            return {
              ...shift,
              scheduledBreaks: (shift.scheduledBreaks || []).filter(
                (b) => b.id !== event.breakId
              ),
            };
          })
        );
        break;
    }
  }, []);

  const connect = useCallback(() => {
    if (!facilityId) return;

    // Close existing connection
    if (eventSourceRef.current) {
      isIntentionalDisconnectRef.current = true;
      eventSourceRef.current.close();
    }

    // 日付パラメータを追加
    let url = `${API_URL}/api/facilities/${facilityId}/events`;
    if (selectedDate) {
      url += `?date=${selectedDate}`;
    }
    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('open', () => {
      setIsConnected(true);
      setError(null);
      isIntentionalDisconnectRef.current = false;
    });

    eventSource.addEventListener('message', (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data);
        handleEvent(data);
      } catch {
        console.error('Failed to parse SSE event:', event.data);
      }
    });

    eventSource.addEventListener('error', () => {
      setIsConnected(false);
      eventSource.close();

      // 意図的な切断（日付変更など）の場合はエラーメッセージを表示せず、自動再接続もしない
      // （useEffectのdependency変更による再接続が行われるため）
      if (isIntentionalDisconnectRef.current) {
        isIntentionalDisconnectRef.current = false;
        return;
      }

      setError('Connection lost. Reconnecting...');

      // Reconnect after delay (予期しない切断の場合のみ)
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, RECONNECT_DELAY);
    });
  }, [facilityId, selectedDate, handleEvent]);

  useEffect(() => {
    connect();

    return () => {
      // cleanup時も意図的な切断としてマーク
      isIntentionalDisconnectRef.current = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Operations
  const lockCourt = useCallback(
    async (courtId: string) => {
      if (!facilityId) throw new Error('No facility selected');
      return sessionsApi.lock(facilityId, courtId);
    },
    [facilityId]
  );

  const unlockSession = useCallback(
    async (sessionId: string) => {
      if (!facilityId) throw new Error('No facility selected');
      await sessionsApi.unlock(facilityId, sessionId);
    },
    [facilityId]
  );

  const reserveSession = useCallback(
    async (sessionId: string, data: ReserveSessionInput) => {
      if (!facilityId) throw new Error('No facility selected');
      await sessionsApi.reserve(facilityId, sessionId, data);
    },
    [facilityId]
  );

  const lockAndReserve = useCallback(
    async (courtId: string, data: LockAndReserveInput): Promise<{ sessionId: string }> => {
      if (!facilityId) throw new Error('No facility selected');
      // ロックして即座に予約
      const { sessionId } = await sessionsApi.lock(facilityId, courtId);
      await sessionsApi.reserve(facilityId, sessionId, data);
      return { sessionId };
    },
    [facilityId]
  );

  const startSession = useCallback(
    async (sessionId: string) => {
      if (!facilityId) throw new Error('No facility selected');
      await sessionsApi.start(facilityId, sessionId);
    },
    [facilityId]
  );

  const completeSession = useCallback(
    async (sessionId: string, data?: CompleteSessionInput) => {
      if (!facilityId) throw new Error('No facility selected');
      await sessionsApi.complete(facilityId, sessionId, data);
    },
    [facilityId]
  );

  const cancelSession = useCallback(
    async (sessionId: string) => {
      if (!facilityId) throw new Error('No facility selected');
      await sessionsApi.cancel(facilityId, sessionId);
    },
    [facilityId]
  );

  const assignStaff = useCallback(
    async (sessionId: string, shiftId: string, scheduledEndTime?: number) => {
      if (!facilityId) throw new Error('No facility selected');
      const result = await assignmentsApi.assign(facilityId, sessionId, {
        shiftId,
        scheduledEndTime,
      });
      return result.assignmentId;
    },
    [facilityId]
  );

  const unassignStaff = useCallback(
    async (sessionId: string, shiftId: string) => {
      if (!facilityId) throw new Error('No facility selected');
      await assignmentsApi.unassign(facilityId, sessionId, shiftId);
    },
    [facilityId]
  );

  const scheduleHandover = useCallback(
    async (assignmentId: string, nextShiftId: string, handoverTime: number, note?: string) => {
      if (!facilityId) throw new Error('No facility selected');
      const result = await assignmentsApi.scheduleHandover(facilityId, assignmentId, {
        nextShiftId,
        handoverTime,
        note,
      });
      return result.newAssignmentId;
    },
    [facilityId]
  );

  const executeHandover = useCallback(
    async (assignmentId: string, note?: string) => {
      if (!facilityId) throw new Error('No facility selected');
      await assignmentsApi.executeHandover(facilityId, assignmentId, note);
    },
    [facilityId]
  );

  const updateStaffStatus = useCallback(
    async (staffId: string, status: 'idle' | 'busy' | 'break') => {
      if (!facilityId) throw new Error('No facility selected');
      await staffApi.updateStatus(facilityId, staffId, status);
    },
    [facilityId]
  );

  const swapCourts = useCallback(
    async (sessionId1: string, sessionId2: string) => {
      if (!facilityId) throw new Error('No facility selected');
      await sessionsApi.swapCourts(facilityId, sessionId1, sessionId2);
    },
    [facilityId]
  );

  return {
    courts,
    shifts,
    isConnected,
    error,
    lockCourt,
    unlockSession,
    reserveSession,
    lockAndReserve,
    startSession,
    completeSession,
    cancelSession,
    assignStaff,
    unassignStaff,
    scheduleHandover,
    executeHandover,
    updateStaffStatus,
    swapCourts,
  };
}
