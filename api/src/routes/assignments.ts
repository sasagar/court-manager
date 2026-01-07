/**
 * アサインメント管理APIルート
 *
 * スタッフのセッションへのアサイン・交代管理
 * - セッションへのスタッフアサイン
 * - アサイン解除
 * - 予定交代の追加・実行
 *
 * @module routes/assignments
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';
import { broadcastToFacility } from '../lib/sse';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * POST /:facilityId/sessions/:sessionId/assign
 * スタッフをセッションにアサイン
 */
app.post(
  '/:facilityId/sessions/:sessionId/assign',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const user = c.get('user');
    const body = await c.req.json<{
      shiftId: string;
      scheduledStartTime?: number;
      scheduledEndTime?: number;
    }>();

    if (!body.shiftId) {
      return c.json({ error: 'shiftId is required' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    // セッションの存在確認（シフトタイムライン更新用の情報も取得）
    const session = await c.env.DB.prepare(`
      SELECT
        cs.id, cs.status, cs.court_id, cs.customer_name,
        cs.start_time, cs.estimated_end_time, cs.display_color,
        c.name AS court_name,
        p.name AS plan_name, p.short_name AS plan_short_name, p.color_code AS plan_color
      FROM court_sessions cs
      JOIN courts c ON cs.court_id = c.id
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE cs.id = ? AND cs.facility_id = ?
    `)
      .bind(sessionId, facilityId)
      .first<{
        id: number; status: string; court_id: string; customer_name: string;
        start_time: number; estimated_end_time: number | null; display_color: string | null;
        court_name: string; plan_name: string | null; plan_short_name: string | null; plan_color: string | null;
      }>();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    if (!['reserved', 'in_use'].includes(session.status)) {
      return c.json({ error: 'Session is not in a valid state for assignment' }, 400);
    }

    // シフトの存在確認とスタッフ情報取得
    const shift = await c.env.DB.prepare(`
      SELECT sh.id, sh.staff_id, st.display_name, st.color_code
      FROM shifts sh
      JOIN staff st ON sh.staff_id = st.id
      WHERE sh.id = ? AND sh.facility_id = ?
    `)
      .bind(body.shiftId, facilityId)
      .first<{ id: string; staff_id: string; display_name: string; color_code: string }>();

    if (!shift) {
      return c.json({ error: 'Shift not found' }, 404);
    }

    // 既存のアサインメントをチェック
    const existingAssignment = await c.env.DB.prepare(`
      SELECT id FROM session_assignments
      WHERE session_id = ? AND shift_id = ? AND status IN ('scheduled', 'active')
    `)
      .bind(sessionId, body.shiftId)
      .first();

    if (existingAssignment) {
      return c.json({ error: 'Staff is already assigned to this session' }, 409);
    }

    // アサインメントを作成
    const result = await c.env.DB.prepare(`
      INSERT INTO session_assignments (session_id, shift_id, scheduled_start_time, scheduled_end_time, status, assigned_by)
      VALUES (?, ?, ?, ?, 'scheduled', ?)
      RETURNING id
    `)
      .bind(
        sessionId,
        body.shiftId,
        body.scheduledStartTime || now,
        body.scheduledEndTime || null,
        user.id
      )
      .first<{ id: number }>();

    // スタッフの稼働状況を更新
    await c.env.DB.prepare(`
      INSERT INTO staff_activity (staff_id, facility_id, current_session_id, status, last_updated)
      VALUES (?, ?, ?, 'busy', ?)
      ON CONFLICT (staff_id) DO UPDATE SET
        current_session_id = excluded.current_session_id,
        status = 'busy',
        last_updated = excluded.last_updated
    `)
      .bind(shift.staff_id, facilityId, sessionId, now)
      .run();

    // SSEブロードキャスト（シフトタイムライン更新用のセッション情報も含める）
    broadcastToFacility(facilityId, {
      type: 'STAFF_ASSIGNED',
      sessionId: Number(sessionId),
      assignmentId: result?.id,
      shiftId: body.shiftId,
      staffId: shift.staff_id,
      staffName: shift.display_name,
      staffColor: shift.color_code,
      // シフトタイムライン更新用
      sessionInfo: {
        courtId: session.court_id,
        courtName: session.court_name,
        customerName: session.customer_name,
        sessionStartTime: session.start_time,
        sessionEndTime: session.estimated_end_time,
        sessionStatus: session.status,
        displayColor: session.display_color || session.plan_color,
        planName: session.plan_name,
        planShortName: session.plan_short_name,
        scheduledStartTime: body.scheduledStartTime || now,
        scheduledEndTime: body.scheduledEndTime || null,
      },
    });

    return c.json({ assignmentId: result?.id }, 201);
  }
);

// スタッフのアサインを解除
app.delete(
  '/:facilityId/sessions/:sessionId/assign/:shiftId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const shiftId = c.req.param('shiftId');
    const now = Math.floor(Date.now() / 1000);

    // アサインメントを取得
    const assignment = await c.env.DB.prepare(`
      SELECT sa.id, sh.staff_id
      FROM session_assignments sa
      JOIN shifts sh ON sa.shift_id = sh.id
      WHERE sa.session_id = ? AND sa.shift_id = ? AND sa.status IN ('scheduled', 'active')
    `)
      .bind(sessionId, shiftId)
      .first<{ id: number; staff_id: string }>();

    if (!assignment) {
      return c.json({ error: 'Assignment not found' }, 404);
    }

    // アサインメントを完了に変更
    await c.env.DB.prepare(`
      UPDATE session_assignments SET status = 'completed', actual_end_time = ? WHERE id = ?
    `)
      .bind(now, assignment.id)
      .run();

    // スタッフの稼働状況を更新
    await c.env.DB.prepare(`
      UPDATE staff_activity SET current_session_id = NULL, status = 'idle', last_updated = ?
      WHERE staff_id = ?
    `)
      .bind(now, assignment.staff_id)
      .run();

    // SSEブロードキャスト（シフトタイムライン更新用にshiftIdも含める）
    broadcastToFacility(facilityId, {
      type: 'STAFF_UNASSIGNED',
      sessionId: Number(sessionId),
      assignmentId: assignment.id,
      shiftId: shiftId,
    });

    return c.json({ success: true });
  }
);

// 予定交代を追加
app.post(
  '/:facilityId/sessions/:sessionId/schedule-handover',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const user = c.get('user');
    const body = await c.req.json<{
      currentAssignmentId: number;
      newShiftId: string;
      handoverTime: number;
      handoverNote?: string;
    }>();

    if (!body.currentAssignmentId || !body.newShiftId || !body.handoverTime) {
      return c.json(
        { error: 'currentAssignmentId, newShiftId, and handoverTime are required' },
        400
      );
    }

    // 現在のアサインメントを確認
    const currentAssignment = await c.env.DB.prepare(`
      SELECT sa.id, sh.staff_id, st.display_name AS old_staff_name
      FROM session_assignments sa
      JOIN shifts sh ON sa.shift_id = sh.id
      JOIN staff st ON sh.staff_id = st.id
      WHERE sa.id = ? AND sa.session_id = ? AND sa.status IN ('scheduled', 'active')
    `)
      .bind(body.currentAssignmentId, sessionId)
      .first<{ id: number; staff_id: string; old_staff_name: string }>();

    if (!currentAssignment) {
      return c.json({ error: 'Current assignment not found' }, 404);
    }

    // 新しいシフトを確認
    const newShift = await c.env.DB.prepare(`
      SELECT sh.id, sh.staff_id, st.display_name, st.color_code
      FROM shifts sh
      JOIN staff st ON sh.staff_id = st.id
      WHERE sh.id = ? AND sh.facility_id = ?
    `)
      .bind(body.newShiftId, facilityId)
      .first<{ id: string; staff_id: string; display_name: string; color_code: string }>();

    if (!newShift) {
      return c.json({ error: 'New shift not found' }, 404);
    }

    // 新しいアサインメントを作成
    const result = await c.env.DB.prepare(`
      INSERT INTO session_assignments (session_id, shift_id, scheduled_start_time, status, replaces, handover_note, assigned_by)
      VALUES (?, ?, ?, 'scheduled', ?, ?, ?)
      RETURNING id
    `)
      .bind(
        sessionId,
        body.newShiftId,
        body.handoverTime,
        body.currentAssignmentId,
        body.handoverNote || null,
        user.id
      )
      .first<{ id: number }>();

    // 現在のアサインメントに終了予定時刻と次のアサインを設定
    await c.env.DB.prepare(`
      UPDATE session_assignments SET scheduled_end_time = ?, replaced_by = ? WHERE id = ?
    `)
      .bind(body.handoverTime, result?.id, body.currentAssignmentId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'HANDOVER_SCHEDULED',
      sessionId: Number(sessionId),
      currentAssignmentId: body.currentAssignmentId,
      newAssignmentId: result?.id,
      oldStaffName: currentAssignment.old_staff_name,
      newStaffName: newShift.display_name,
      newStaffColor: newShift.color_code,
      handoverTime: body.handoverTime,
      handoverNote: body.handoverNote,
    });

    return c.json({ assignmentId: result?.id }, 201);
  }
);

// 予定交代を実行
app.post(
  '/:facilityId/sessions/:sessionId/execute-handover/:assignmentId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const assignmentId = c.req.param('assignmentId');
    const now = Math.floor(Date.now() / 1000);

    // 新しいアサインメントを取得
    const newAssignment = await c.env.DB.prepare(`
      SELECT sa.id, sa.replaces, sh.staff_id AS new_staff_id
      FROM session_assignments sa
      JOIN shifts sh ON sa.shift_id = sh.id
      WHERE sa.id = ? AND sa.session_id = ? AND sa.status = 'scheduled'
    `)
      .bind(assignmentId, sessionId)
      .first<{ id: number; replaces: number; new_staff_id: string }>();

    if (!newAssignment) {
      return c.json({ error: 'Assignment not found or not in scheduled status' }, 404);
    }

    if (!newAssignment.replaces) {
      return c.json({ error: 'This assignment is not a handover' }, 400);
    }

    // 前のアサインメントを取得
    const previousAssignment = await c.env.DB.prepare(`
      SELECT sa.id, sh.staff_id AS old_staff_id
      FROM session_assignments sa
      JOIN shifts sh ON sa.shift_id = sh.id
      WHERE sa.id = ?
    `)
      .bind(newAssignment.replaces)
      .first<{ id: number; old_staff_id: string }>();

    if (!previousAssignment) {
      return c.json({ error: 'Previous assignment not found' }, 404);
    }

    // 前のアサインメントを交代済みに
    await c.env.DB.prepare(`
      UPDATE session_assignments SET status = 'replaced', actual_end_time = ? WHERE id = ?
    `)
      .bind(now, previousAssignment.id)
      .run();

    // 新しいアサインメントをアクティブに
    await c.env.DB.prepare(`
      UPDATE session_assignments SET status = 'active', actual_start_time = ? WHERE id = ?
    `)
      .bind(now, newAssignment.id)
      .run();

    // 前のスタッフの稼働状況を更新
    await c.env.DB.prepare(`
      UPDATE staff_activity SET current_session_id = NULL, status = 'idle', last_updated = ?
      WHERE staff_id = ?
    `)
      .bind(now, previousAssignment.old_staff_id)
      .run();

    // 新しいスタッフの稼働状況を更新
    await c.env.DB.prepare(`
      INSERT INTO staff_activity (staff_id, facility_id, current_session_id, status, last_updated)
      VALUES (?, ?, ?, 'busy', ?)
      ON CONFLICT (staff_id) DO UPDATE SET
        current_session_id = excluded.current_session_id,
        status = 'busy',
        last_updated = excluded.last_updated
    `)
      .bind(newAssignment.new_staff_id, facilityId, sessionId, now)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'HANDOVER_EXECUTED',
      sessionId: Number(sessionId),
      previousAssignmentId: previousAssignment.id,
      newAssignmentId: newAssignment.id,
    });

    return c.json({ success: true });
  }
);

export default app;
