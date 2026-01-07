/**
 * リアルタイムイベントAPIルート
 *
 * Server-Sent Events (SSE) によるリアルタイム更新配信
 * - 初期データ送信（コート・シフト・セッション）
 * - ハートビート（30秒間隔）
 * - 各種イベントのブロードキャスト
 *
 * @module routes/events
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';
import {
  registerClient,
  unregisterClient,
  sendHeartbeat,
  sendToClient,
} from '../lib/sse';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** ハートビート間隔（ミリ秒） */
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * GET /:facilityId/events
 * SSEストリーム接続
 */
app.get(
  '/:facilityId/events',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const clientId = crypto.randomUUID();

    // 日付パラメータを取得（指定がなければ当日）
    const dateParam = c.req.query('date');
    const targetDate = dateParam || new Date().toISOString().split('T')[0];

    // 日付範囲（その日の0:00〜翌日0:00）をUnixタイムスタンプで計算
    const dateObj = new Date(targetDate + 'T00:00:00+09:00'); // JST
    const startOfDay = Math.floor(dateObj.getTime() / 1000);
    const endOfDay = startOfDay + 24 * 60 * 60;

    // 初期データを取得
    const [courtsResult, sessionsResult, shiftsResult, breaksResult] = await Promise.all([
      // コート一覧
      c.env.DB.prepare(`
        SELECT id, name, sort_order, is_active
        FROM courts
        WHERE facility_id = ? AND is_active = 1
        ORDER BY sort_order, name
      `)
        .bind(facilityId)
        .all(),
      // 指定日のセッション一覧（コートごとに複数可能）
      c.env.DB.prepare(`
        SELECT
          cs.id AS session_id,
          cs.court_id,
          cs.customer_name,
          cs.customer_count,
          cs.start_time,
          cs.estimated_end_time,
          cs.status,
          cs.locked_by,
          cs.lock_expires_at,
          cs.plan_id,
          cs.max_capacity AS session_max_capacity,
          cs.display_color,
          cs.payment_status,
          u.name AS locked_by_name,
          p.name AS plan_name,
          p.short_name AS plan_short_name,
          p.is_slot_based,
          p.max_capacity AS plan_max_capacity,
          p.color_code AS plan_color
        FROM court_sessions cs
        LEFT JOIN user u ON cs.locked_by = u.id
        LEFT JOIN plans p ON cs.plan_id = p.id
        WHERE cs.facility_id = ?
          AND cs.status IN ('locking', 'reserved', 'in_use')
          AND cs.start_time >= ? AND cs.start_time < ?
        ORDER BY cs.start_time
      `)
        .bind(facilityId, startOfDay, endOfDay)
        .all(),
      // 指定日のシフト一覧
      c.env.DB.prepare(`
        SELECT
          sh.id,
          sh.staff_id,
          st.display_name AS staff_name,
          st.color_code AS staff_color,
          st.image_url AS staff_image_url,
          sh.date,
          sh.start_time,
          sh.end_time,
          sh.status,
          sa.status AS activity_status,
          sa.current_session_id
        FROM shifts sh
        JOIN staff st ON sh.staff_id = st.id
        LEFT JOIN staff_activity sa ON st.id = sa.staff_id AND sa.facility_id = ?
        WHERE sh.facility_id = ? AND sh.date = ?
        ORDER BY sh.start_time
      `)
        .bind(facilityId, facilityId, targetDate)
        .all(),
      // 指定日の予定休憩一覧
      c.env.DB.prepare(`
        SELECT
          sb.id,
          sb.shift_id,
          sb.start_time,
          sb.end_time,
          sb.memo,
          s.staff_id
        FROM scheduled_breaks sb
        JOIN shifts s ON sb.shift_id = s.id
        WHERE sb.facility_id = ?
          AND sb.start_time >= ? AND sb.start_time < ?
        ORDER BY sb.start_time
      `)
        .bind(facilityId, startOfDay, endOfDay)
        .all(),
    ]);

    // セッションIDを収集
    const sessionIds = sessionsResult.results
      .map((session) => session.session_id as number);

    // アサインメント情報、オプション、予約を取得
    let assignments: Record<number, unknown[]> = {};
    let sessionOptions: Record<number, unknown[]> = {};
    let sessionBookings: Record<number, unknown[]> = {};
    if (sessionIds.length > 0) {
      const [assignmentResults, optionsResults, bookingsResults] = await Promise.all([
        c.env.DB.prepare(`
          SELECT
            sa.id,
            sa.session_id,
            sa.shift_id,
            sa.scheduled_start_time,
            sa.scheduled_end_time,
            sa.status,
            sa.handover_note,
            sh.staff_id,
            st.display_name AS staff_name,
            st.color_code AS staff_color
          FROM session_assignments sa
          JOIN shifts sh ON sa.shift_id = sh.id
          JOIN staff st ON sh.staff_id = st.id
          WHERE sa.session_id IN (${sessionIds.map(() => '?').join(',')})
            AND sa.status IN ('scheduled', 'active')
          ORDER BY sa.scheduled_start_time
        `)
          .bind(...sessionIds)
          .all(),
        c.env.DB.prepare(`
          SELECT
            so.id,
            so.session_id,
            so.option_id,
            so.quantity,
            po.name AS option_name,
            po.price AS option_price
          FROM session_options so
          JOIN plan_options po ON so.option_id = po.id
          WHERE so.session_id IN (${sessionIds.map(() => '?').join(',')})
          ORDER BY po.sort_order
        `)
          .bind(...sessionIds)
          .all(),
        // 個別予約（枠プラン用）
        c.env.DB.prepare(`
          SELECT
            sb.id,
            sb.session_id,
            sb.customer_name,
            sb.customer_count,
            sb.payment_status
          FROM session_bookings sb
          WHERE sb.session_id IN (${sessionIds.map(() => '?').join(',')})
            AND sb.status = 'confirmed'
          ORDER BY sb.created_at
        `)
          .bind(...sessionIds)
          .all(),
      ]);

      for (const assignment of assignmentResults.results) {
        const sessionId = assignment.session_id as number;
        if (!assignments[sessionId]) {
          assignments[sessionId] = [];
        }
        assignments[sessionId].push({
          id: assignment.id,
          sessionId: assignment.session_id,
          shiftId: assignment.shift_id,
          staffId: assignment.staff_id,
          staffName: assignment.staff_name,
          staffColor: assignment.staff_color,
          scheduledStartTime: assignment.scheduled_start_time,
          scheduledEndTime: assignment.scheduled_end_time,
          status: assignment.status,
          handoverNote: assignment.handover_note,
        });
      }

      for (const option of optionsResults.results) {
        const sessionId = option.session_id as number;
        if (!sessionOptions[sessionId]) {
          sessionOptions[sessionId] = [];
        }
        sessionOptions[sessionId].push({
          id: option.id,
          optionId: option.option_id,
          optionName: option.option_name,
          optionPrice: option.option_price,
          quantity: option.quantity,
        });
      }

      for (const booking of bookingsResults.results) {
        const sessionId = booking.session_id as number;
        if (!sessionBookings[sessionId]) {
          sessionBookings[sessionId] = [];
        }
        sessionBookings[sessionId].push({
          id: booking.id,
          customerName: booking.customer_name,
          customerCount: booking.customer_count,
          paymentStatus: booking.payment_status || 'unpaid',
        });
      }
    }

    // シフトIDごとのアサインメント情報を構築（セッションの有無に関係なく取得）
    let shiftAssignments: Record<string, unknown[]> = {};
    const shiftIds = shiftsResult.results.map((shift) => shift.id as string);
    if (shiftIds.length > 0) {
      const shiftAssignmentResults = await c.env.DB.prepare(`
        SELECT
          sa.id AS assignment_id,
          sa.session_id,
          sa.shift_id,
          sa.scheduled_start_time,
          sa.scheduled_end_time,
          sa.status AS assignment_status,
          cs.court_id,
          cs.customer_name,
          cs.start_time AS session_start_time,
          cs.estimated_end_time AS session_end_time,
          cs.status AS session_status,
          cs.display_color,
          c.name AS court_name,
          p.name AS plan_name,
          p.short_name AS plan_short_name,
          p.color_code AS plan_color
        FROM session_assignments sa
        JOIN court_sessions cs ON sa.session_id = cs.id
        JOIN courts c ON cs.court_id = c.id
        LEFT JOIN plans p ON cs.plan_id = p.id
        WHERE sa.shift_id IN (${shiftIds.map(() => '?').join(',')})
          AND sa.status IN ('scheduled', 'active')
          AND cs.status IN ('reserved', 'in_use')
        ORDER BY cs.start_time
      `)
        .bind(...shiftIds)
        .all();

      for (const assignment of shiftAssignmentResults.results) {
        const shiftId = assignment.shift_id as string;
        if (!shiftAssignments[shiftId]) {
          shiftAssignments[shiftId] = [];
        }
        shiftAssignments[shiftId].push({
          assignmentId: assignment.assignment_id,
          sessionId: assignment.session_id,
          courtId: assignment.court_id,
          courtName: assignment.court_name,
          customerName: assignment.customer_name,
          sessionStartTime: assignment.session_start_time,
          sessionEndTime: assignment.session_end_time,
          sessionStatus: assignment.session_status,
          displayColor: assignment.display_color || assignment.plan_color,
          planName: assignment.plan_name,
          planShortName: assignment.plan_short_name,
          assignmentStatus: assignment.assignment_status,
          scheduledStartTime: assignment.scheduled_start_time,
          scheduledEndTime: assignment.scheduled_end_time,
        });
      }
    }

    // セッションをコートIDでグループ化
    const sessionsByCourtId: Record<string, typeof sessionsResult.results> = {};
    for (const session of sessionsResult.results) {
      const courtId = session.court_id as string;
      if (!sessionsByCourtId[courtId]) {
        sessionsByCourtId[courtId] = [];
      }
      sessionsByCourtId[courtId].push(session);
    }

    // セッションデータを整形する関数
    const formatSession = (session: (typeof sessionsResult.results)[0]) => ({
      id: session.session_id,
      customerName: session.customer_name,
      customerCount: session.customer_count,
      startTime: session.start_time,
      estimatedEndTime: session.estimated_end_time,
      status: session.status,
      lockedBy: session.locked_by,
      lockedByName: session.locked_by_name,
      lockExpiresAt: session.lock_expires_at,
      planId: session.plan_id,
      planName: session.plan_name,
      planShortName: session.plan_short_name,
      isSlotBased: session.is_slot_based === 1,
      maxCapacity: session.session_max_capacity ?? session.plan_max_capacity,
      displayColor: session.display_color || session.plan_color,
      paymentStatus: session.payment_status || 'unpaid',
      assignments: assignments[session.session_id as number] || [],
      options: sessionOptions[session.session_id as number] || [],
      bookings: sessionBookings[session.session_id as number] || [],
    });

    // コートデータを整形
    const courts = courtsResult.results.map((court) => {
      const courtSessions = sessionsByCourtId[court.id as string] || [];
      const formattedSessions = courtSessions.map(formatSession);
      return {
        id: court.id,
        name: court.name,
        sortOrder: court.sort_order,
        isActive: court.is_active === 1,
        // 後方互換性のため、最初のセッションをcurrentSessionに設定
        currentSession: formattedSessions.length > 0 ? formattedSessions[0] : null,
        // 全セッション（複数対応）
        sessions: formattedSessions,
      };
    });

    // 休憩データをシフトIDでグループ化
    const breaksByShiftId: Record<string, { id: number; startTime: number; endTime: number; memo?: string }[]> = {};
    for (const brk of breaksResult.results) {
      const shiftId = brk.shift_id as string;
      if (!breaksByShiftId[shiftId]) {
        breaksByShiftId[shiftId] = [];
      }
      breaksByShiftId[shiftId].push({
        id: brk.id as number,
        startTime: brk.start_time as number,
        endTime: brk.end_time as number,
        memo: brk.memo as string | undefined,
      });
    }

    // シフトデータを整形
    const shifts = shiftsResult.results.map((shift) => ({
      id: shift.id,
      staffId: shift.staff_id,
      staffName: shift.staff_name,
      staffColor: shift.staff_color,
      staffImageUrl: shift.staff_image_url,
      date: shift.date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      status: shift.status,
      activityStatus: shift.activity_status || 'idle',
      currentSessionId: shift.current_session_id,
      assignedSessions: shiftAssignments[shift.id as string] || [],
      scheduledBreaks: breaksByShiftId[shift.id as string] || [],
    }));

    // SSEストリームを作成
    let heartbeatInterval: ReturnType<typeof setInterval>;

    const stream = new ReadableStream({
      start(controller) {
        // クライアントを登録
        registerClient(clientId, facilityId, controller);

        // 初期データを送信
        sendToClient(clientId, {
          type: 'INITIAL',
          courts,
          shifts,
        });

        // ハートビートを開始
        heartbeatInterval = setInterval(() => {
          const isAlive = sendHeartbeat(clientId);
          if (!isAlive) {
            clearInterval(heartbeatInterval);
          }
        }, HEARTBEAT_INTERVAL_MS);
      },
      cancel() {
        clearInterval(heartbeatInterval);
        unregisterClient(clientId);
      },
    });

    const origin = c.req.header('Origin');
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://court-management-frontend.sasagar-2ef.workers.dev',
    ];

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...(origin && allowedOrigins.includes(origin)
          ? {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Credentials': 'true',
            }
          : {}),
      },
    });
  }
);

export default app;
