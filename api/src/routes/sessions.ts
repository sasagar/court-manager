/**
 * セッション管理APIルート
 *
 * コートセッション（予約・使用中）のライフサイクル管理
 * - ロック・予約確定・開始・終了
 * - 枠プラン（スロットベース）の予約管理
 * - 時間変更・コート移動
 * - 支払いステータス・オプション管理
 *
 * @module routes/sessions
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';
import { broadcastToFacility } from '../lib/sse';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** ロックの有効期限（秒） */
const LOCK_DURATION_SECONDS = 60;

/**
 * GET /:facilityId/sessions/:sessionId
 * セッション詳細を取得
 */
app.get(
  '/:facilityId/sessions/:sessionId',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');

    const session = await c.env.DB.prepare(`
      SELECT
        cs.id,
        cs.court_id,
        cs.plan_id,
        cs.customer_name,
        cs.customer_count,
        cs.start_time,
        cs.estimated_end_time,
        cs.status,
        cs.memo,
        cs.display_color,
        cs.is_slot_based,
        cs.max_capacity,
        cs.payment_status,
        cs.created_at,
        p.name as plan_name,
        p.is_slot_based as plan_is_slot_based,
        co.name as court_name
      FROM court_sessions cs
      LEFT JOIN plans p ON cs.plan_id = p.id
      LEFT JOIN courts co ON cs.court_id = co.id
      WHERE cs.id = ? AND cs.facility_id = ?
    `)
      .bind(sessionId, facilityId)
      .first<Record<string, unknown>>();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // オプション情報を取得
    const options = await c.env.DB.prepare(`
      SELECT
        so.option_id,
        so.quantity,
        po.name as option_name,
        po.selection_type
      FROM session_options so
      JOIN plan_options po ON so.option_id = po.id
      WHERE so.session_id = ?
    `)
      .bind(sessionId)
      .all<{ option_id: string; quantity: number; option_name: string; selection_type: string }>();

    // アサインメント情報を取得
    const assignments = await c.env.DB.prepare(`
      SELECT
        sa.id,
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
      WHERE sa.session_id = ? AND sa.status IN ('scheduled', 'active')
      ORDER BY sa.scheduled_start_time
    `)
      .bind(sessionId)
      .all<{
        id: number;
        shift_id: string;
        scheduled_start_time: number;
        scheduled_end_time: number | null;
        status: string;
        handover_note: string | null;
        staff_id: string;
        staff_name: string;
        staff_color: string | null;
      }>();

    // セッションのis_slot_basedまたはプランのis_slot_basedを使用（後方互換性）
    const isSlotBased = session.is_slot_based === 1 || session.plan_is_slot_based === 1;

    return c.json({
      session: {
        id: session.id,
        courtId: session.court_id,
        courtName: session.court_name,
        planId: session.plan_id,
        planName: session.plan_name,
        customerName: session.customer_name,
        customerCount: session.customer_count,
        startTime: session.start_time,
        estimatedEndTime: session.estimated_end_time,
        status: session.status,
        memo: session.memo,
        displayColor: session.display_color,
        isSlotBased,
        maxCapacity: session.max_capacity,
        paymentStatus: session.payment_status || 'unpaid',
        createdAt: session.created_at,
        options: options.results.map((opt) => ({
          optionId: opt.option_id,
          optionName: opt.option_name,
          quantity: opt.quantity,
          selectionType: opt.selection_type,
        })),
        assignments: assignments.results.map((a) => ({
          id: a.id,
          shiftId: a.shift_id,
          staffId: a.staff_id,
          staffName: a.staff_name,
          staffColor: a.staff_color,
          scheduledStartTime: a.scheduled_start_time,
          scheduledEndTime: a.scheduled_end_time,
          status: a.status,
          handoverNote: a.handover_note,
        })),
      },
    });
  }
);

// セッション時間を更新（ドラッグ・アンド・ドロップ用）
app.patch(
  '/:facilityId/sessions/:sessionId/time',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      startTime: number;
      estimatedEndTime: number;
    }>();

    if (!body.startTime || !body.estimatedEndTime) {
      return c.json({ error: 'startTime and estimatedEndTime are required' }, 400);
    }

    // セッションの存在確認
    const session = await c.env.DB.prepare(`
      SELECT id, court_id, status FROM court_sessions
      WHERE id = ? AND facility_id = ?
    `)
      .bind(sessionId, facilityId)
      .first<{ id: string; court_id: string; status: string }>();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // 使用中または完了したセッションは時間変更不可
    if (session.status === 'in_use' || session.status === 'completed') {
      return c.json({ error: 'Cannot change time of in_use or completed session' }, 400);
    }

    // 時間を更新
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET start_time = ?, estimated_end_time = ?
      WHERE id = ?
    `)
      .bind(body.startTime, body.estimatedEndTime, sessionId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'SESSION_TIME_UPDATED',
      courtId: session.court_id,
      sessionId,
      startTime: body.startTime,
      estimatedEndTime: body.estimatedEndTime,
    });

    return c.json({ success: true });
  }
);

// コートをロック（予約作業開始）
// 注意: 同じコートでも異なる時間帯なら複数のセッションを予約可能
// 時間帯の重複チェックは予約確定時（reserve）に行う
app.post(
  '/:facilityId/courts/:courtId/lock',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const courtId = c.req.param('courtId');
    const user = c.get('user');
    const now = Math.floor(Date.now() / 1000);
    const lockExpiresAt = now + LOCK_DURATION_SECONDS;

    // 期限切れのロックをクリア
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET status = 'cancelled', locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
      WHERE court_id = ? AND status = 'locking' AND lock_expires_at < ?
    `)
      .bind(courtId, now)
      .run();

    // コート名を取得
    const court = await c.env.DB.prepare(`
      SELECT name FROM courts WHERE id = ? AND facility_id = ?
    `)
      .bind(courtId, facilityId)
      .first<{ name: string }>();

    if (!court) {
      return c.json({ error: 'Court not found' }, 404);
    }

    // 新しいセッションを作成してロック（コート名もスナップショットとして保存）
    const result = await c.env.DB.prepare(`
      INSERT INTO court_sessions (facility_id, court_id, court_name, status, locked_by, locked_at, lock_expires_at)
      VALUES (?, ?, ?, 'locking', ?, ?, ?)
      RETURNING id
    `)
      .bind(facilityId, courtId, court.name, user.id, now, lockExpiresAt)
      .first<{ id: number }>();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'COURT_LOCKED',
      courtId,
      sessionId: result?.id,
      lockedBy: user.id,
      lockedByName: user.name,
      expiresAt: lockExpiresAt,
    });

    return c.json({
      sessionId: result?.id,
      expiresAt: lockExpiresAt,
    });
  }
);

// コートのロックを解放（courtIdベース）
app.post(
  '/:facilityId/courts/:courtId/unlock',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const courtId = c.req.param('courtId');
    const user = c.get('user');

    const result = await c.env.DB.prepare(`
      UPDATE court_sessions
      SET status = 'available', locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
      WHERE court_id = ? AND status = 'locking' AND locked_by = ?
      RETURNING id
    `)
      .bind(courtId, user.id)
      .first();

    if (!result) {
      return c.json({ error: 'No lock to release' }, 404);
    }

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'COURT_UNLOCKED',
      courtId,
    });

    return c.json({ success: true });
  }
);

// セッションのロックを解放（sessionIdベース）
app.post(
  '/:facilityId/sessions/:sessionId/unlock',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const user = c.get('user');

    // セッションを取得してcourtIdを取得
    const session = await c.env.DB.prepare(`
      SELECT id, court_id, locked_by
      FROM court_sessions
      WHERE id = ? AND facility_id = ? AND status = 'locking'
    `)
      .bind(sessionId, facilityId)
      .first<{ id: number; court_id: string; locked_by: string }>();

    if (!session) {
      return c.json({ error: 'Session not found or not in locking status' }, 404);
    }

    // ロックしたユーザーか、adminかどうか確認
    const userRole = c.get('userRole');
    if (session.locked_by !== user.id && userRole !== 'admin') {
      return c.json({ error: 'Not authorized to unlock this session' }, 403);
    }

    // セッションを削除（availableに戻す）
    await c.env.DB.prepare(`
      DELETE FROM court_sessions WHERE id = ?
    `)
      .bind(sessionId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'COURT_UNLOCKED',
      courtId: session.court_id,
      sessionId: session.id,
    });

    return c.json({ success: true });
  }
);

// 予約を確定
app.post(
  '/:facilityId/courts/:courtId/reserve',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const courtId = c.req.param('courtId');
    const user = c.get('user');
    const body = await c.req.json<{
      planId?: string;
      customerName?: string;
      customerCount?: number;
      startTime?: number;
      estimatedEndTime?: number;
      maxCapacity?: number;
      displayColor?: string;
      memo?: string;
    }>();

    const now = Math.floor(Date.now() / 1000);

    // ロック中のセッションを取得
    const session = await c.env.DB.prepare(`
      SELECT id, locked_by
      FROM court_sessions
      WHERE court_id = ? AND status = 'locking' AND locked_by = ?
    `)
      .bind(courtId, user.id)
      .first<{ id: number; locked_by: string }>();

    if (!session) {
      return c.json({ error: 'No active lock found' }, 404);
    }

    // プラン名を取得
    let planName: string | undefined;
    if (body.planId) {
      const plan = await c.env.DB.prepare(`
        SELECT name FROM plans WHERE id = ?
      `)
        .bind(body.planId)
        .first<{ name: string }>();
      planName = plan?.name;
    }

    // 予約確定
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET
        status = 'reserved',
        plan_id = ?,
        customer_name = ?,
        customer_count = ?,
        start_time = ?,
        estimated_end_time = ?,
        max_capacity = ?,
        display_color = ?,
        memo = ?,
        locked_by = NULL,
        locked_at = NULL,
        lock_expires_at = NULL,
        updated_at = ?
      WHERE id = ?
    `)
      .bind(
        body.planId || null,
        body.customerName || null,
        body.customerCount || 1,
        body.startTime || now,
        body.estimatedEndTime || null,
        body.maxCapacity || null,
        body.displayColor || null,
        body.memo || null,
        now,
        session.id
      )
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'COURT_RESERVED',
      courtId,
      sessionId: session.id,
      customerName: body.customerName,
      customerCount: body.customerCount || 1,
      startTime: body.startTime || now,
      estimatedEndTime: body.estimatedEndTime,
      displayColor: body.displayColor,
      planId: body.planId,
      planName,
    });

    return c.json({ sessionId: session.id });
  }
);

// セッション開始
app.post(
  '/:facilityId/sessions/:sessionId/start',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const now = Math.floor(Date.now() / 1000);

    const result = await c.env.DB.prepare(`
      UPDATE court_sessions
      SET status = 'in_use', start_time = COALESCE(start_time, ?), updated_at = ?
      WHERE id = ? AND facility_id = ? AND status = 'reserved'
      RETURNING court_id
    `)
      .bind(now, now, sessionId, facilityId)
      .first<{ court_id: string }>();

    if (!result) {
      return c.json({ error: 'Session not found or not in reserved status' }, 404);
    }

    // アクティブなアサインメントを開始
    await c.env.DB.prepare(`
      UPDATE session_assignments
      SET status = 'active', actual_start_time = ?
      WHERE session_id = ? AND status = 'scheduled'
    `)
      .bind(now, sessionId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'SESSION_STARTED',
      sessionId: Number(sessionId),
      courtId: result.court_id,
      startTime: now,
    });

    return c.json({ success: true });
  }
);

// セッション終了
app.post(
  '/:facilityId/sessions/:sessionId/complete',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const now = Math.floor(Date.now() / 1000);

    // in_useまたはreserved状態のセッションを完了可能に
    const result = await c.env.DB.prepare(`
      UPDATE court_sessions
      SET status = 'completed', actual_end_time = ?, updated_at = ?
      WHERE id = ? AND facility_id = ? AND status IN ('in_use', 'reserved')
      RETURNING court_id
    `)
      .bind(now, now, sessionId, facilityId)
      .first<{ court_id: string }>();

    if (!result) {
      return c.json({ error: 'Session not found or not in active status' }, 404);
    }

    // アクティブなアサインメントを完了
    await c.env.DB.prepare(`
      UPDATE session_assignments
      SET status = 'completed', actual_end_time = ?
      WHERE session_id = ? AND status IN ('scheduled', 'active')
    `)
      .bind(now, sessionId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'SESSION_COMPLETED',
      sessionId: Number(sessionId),
      courtId: result.court_id,
      endTime: now,
    });

    return c.json({ success: true });
  }
);

// 非枠プランのセッション情報を更新
app.patch(
  '/:facilityId/sessions/:sessionId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      customerName?: string;
      customerCount?: number;
      startTime?: number;
      estimatedEndTime?: number;
      memo?: string;
    }>();

    const now = Math.floor(Date.now() / 1000);

    // セッションの存在確認と枠プランでないことを確認
    const session = await c.env.DB.prepare(`
      SELECT cs.id, cs.court_id, cs.status, cs.is_slot_based,
             p.is_slot_based as plan_is_slot_based
      FROM court_sessions cs
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE cs.id = ? AND cs.facility_id = ? AND cs.status IN ('reserved', 'in_use')
    `)
      .bind(sessionId, facilityId)
      .first<{
        id: number;
        court_id: string;
        status: string;
        is_slot_based: number | null;
        plan_is_slot_based: number | null;
      }>();

    if (!session) {
      return c.json({ error: 'Session not found or not active' }, 404);
    }

    // 枠プランの場合はエラー（枠プランは別のAPIで管理）
    const isSlotBased = session.is_slot_based === 1 || session.plan_is_slot_based === 1;
    if (isSlotBased) {
      return c.json({ error: 'Cannot update slot-based session with this endpoint' }, 400);
    }

    // 使用中のセッションは時間変更不可
    if (session.status === 'in_use' && (body.startTime !== undefined || body.estimatedEndTime !== undefined)) {
      return c.json({ error: 'Cannot change time of in_use session' }, 400);
    }

    // 時間帯の重複チェック（時間が変更される場合のみ）
    if (body.startTime !== undefined || body.estimatedEndTime !== undefined) {
      // 現在の時間を取得
      const currentTimes = await c.env.DB.prepare(`
        SELECT start_time, estimated_end_time FROM court_sessions WHERE id = ?
      `)
        .bind(sessionId)
        .first<{ start_time: number; estimated_end_time: number | null }>();

      const newStartTime = body.startTime ?? currentTimes?.start_time ?? now;
      const newEndTime = body.estimatedEndTime ?? currentTimes?.estimated_end_time;

      if (newEndTime) {
        const overlapping = await c.env.DB.prepare(`
          SELECT id, start_time, estimated_end_time, customer_name
          FROM court_sessions
          WHERE court_id = ? AND id != ? AND status IN ('reserved', 'in_use')
            AND start_time < ? AND estimated_end_time > ?
        `)
          .bind(session.court_id, sessionId, newEndTime, newStartTime)
          .first();

        if (overlapping) {
          return c.json({
            error: 'この時間帯には既に予約があります',
            conflictingSession: {
              id: overlapping.id,
              startTime: overlapping.start_time,
              endTime: overlapping.estimated_end_time,
              customerName: overlapping.customer_name,
            },
          }, 409);
        }
      }
    }

    // 更新フィールドを構築
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.customerName !== undefined) {
      updates.push('customer_name = ?');
      values.push(body.customerName);
    }
    if (body.customerCount !== undefined) {
      updates.push('customer_count = ?');
      values.push(body.customerCount);
    }
    if (body.startTime !== undefined) {
      updates.push('start_time = ?');
      values.push(body.startTime);
    }
    if (body.estimatedEndTime !== undefined) {
      updates.push('estimated_end_time = ?');
      values.push(body.estimatedEndTime);
    }
    if (body.memo !== undefined) {
      updates.push('memo = ?');
      values.push(body.memo);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(sessionId);

    await c.env.DB.prepare(`
      UPDATE court_sessions SET ${updates.join(', ')} WHERE id = ?
    `)
      .bind(...values)
      .run();

    // 更新後のセッション情報を取得
    const updated = await c.env.DB.prepare(`
      SELECT customer_name, customer_count, start_time, estimated_end_time, memo
      FROM court_sessions WHERE id = ?
    `)
      .bind(sessionId)
      .first<{
        customer_name: string | null;
        customer_count: number;
        start_time: number;
        estimated_end_time: number | null;
        memo: string | null;
      }>();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'SESSION_UPDATED',
      sessionId: Number(sessionId),
      courtId: session.court_id,
      customerName: updated?.customer_name,
      customerCount: updated?.customer_count,
      startTime: updated?.start_time,
      estimatedEndTime: updated?.estimated_end_time,
      memo: updated?.memo,
    });

    return c.json({
      success: true,
      session: {
        customerName: updated?.customer_name,
        customerCount: updated?.customer_count,
        startTime: updated?.start_time,
        estimatedEndTime: updated?.estimated_end_time,
        memo: updated?.memo,
      },
    });
  }
);

// 支払いステータスを更新
app.patch(
  '/:facilityId/sessions/:sessionId/payment-status',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{ paymentStatus: 'paid' | 'unpaid' }>();

    if (!body.paymentStatus || !['paid', 'unpaid'].includes(body.paymentStatus)) {
      return c.json({ error: 'Invalid payment status. Must be "paid" or "unpaid"' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    const result = await c.env.DB.prepare(`
      UPDATE court_sessions
      SET payment_status = ?, updated_at = ?
      WHERE id = ? AND facility_id = ?
      RETURNING court_id, status
    `)
      .bind(body.paymentStatus, now, sessionId, facilityId)
      .first<{ court_id: string; status: string }>();

    if (!result) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'PAYMENT_STATUS_UPDATED',
      sessionId: Number(sessionId),
      courtId: result.court_id,
      paymentStatus: body.paymentStatus,
    });

    return c.json({ success: true, paymentStatus: body.paymentStatus });
  }
);

// 枠プラン用：予約者なしで枠を作成
app.post(
  '/:facilityId/courts/:courtId/create-slot',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const courtId = c.req.param('courtId');
    const body = await c.req.json<{
      planId: string;
      startTime: number;
      estimatedEndTime: number;
      maxCapacity?: number;
    }>();

    if (!body.planId || !body.startTime || !body.estimatedEndTime) {
      return c.json({ error: 'planId, startTime, and estimatedEndTime are required' }, 400);
    }

    // プランの存在確認と枠プランかどうかチェック
    const plan = await c.env.DB.prepare(`
      SELECT id, name, is_slot_based, max_capacity, color_code
      FROM plans
      WHERE id = ? AND facility_id = ? AND is_active = 1
    `)
      .bind(body.planId, facilityId)
      .first<{ id: string; name: string; is_slot_based: number; max_capacity: number | null; color_code: string | null }>();

    if (!plan) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    if (plan.is_slot_based !== 1) {
      return c.json({ error: 'This plan is not a slot-based plan' }, 400);
    }

    // コートの存在確認
    const court = await c.env.DB.prepare(`
      SELECT id, name FROM courts WHERE id = ? AND facility_id = ? AND is_active = 1
    `)
      .bind(courtId, facilityId)
      .first<{ id: string; name: string }>();

    if (!court) {
      return c.json({ error: 'Court not found' }, 404);
    }

    // 時間帯の重複チェック（同じコートで既存の予約と時間が重複しないか確認）
    const overlapping = await c.env.DB.prepare(`
      SELECT id, start_time, estimated_end_time, customer_name
      FROM court_sessions
      WHERE court_id = ? AND status IN ('reserved', 'in_use')
        AND start_time < ? AND estimated_end_time > ?
    `)
      .bind(courtId, body.estimatedEndTime, body.startTime)
      .first<{ id: number; start_time: number; estimated_end_time: number; customer_name: string | null }>();

    if (overlapping) {
      return c.json({
        error: 'この時間帯には既に予約があります',
        conflictingSession: {
          id: overlapping.id,
          startTime: overlapping.start_time,
          endTime: overlapping.estimated_end_time,
          customerName: overlapping.customer_name,
        },
      }, 409);
    }

    const now = Math.floor(Date.now() / 1000);
    const maxCapacity = body.maxCapacity || plan.max_capacity;

    // 枠を作成（予約者なし、customer_count = 0）
    const result = await c.env.DB.prepare(`
      INSERT INTO court_sessions (
        facility_id, court_id, court_name, plan_id, status,
        customer_count, start_time, estimated_end_time, max_capacity, display_color, is_slot_based, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'reserved', 0, ?, ?, ?, ?, 1, ?, ?)
      RETURNING id
    `)
      .bind(
        facilityId,
        courtId,
        court.name,
        body.planId,
        body.startTime,
        body.estimatedEndTime,
        maxCapacity,
        plan.color_code,
        now,
        now
      )
      .first<{ id: number }>();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'SLOT_CREATED',
      courtId,
      sessionId: result?.id,
      planId: body.planId,
      planName: plan.name,
      startTime: body.startTime,
      estimatedEndTime: body.estimatedEndTime,
      maxCapacity,
      customerCount: 0,
      displayColor: plan.color_code,
      isSlotBased: true,
    });

    return c.json({
      sessionId: result?.id,
      planName: plan.name,
      maxCapacity,
    }, 201);
  }
);

// 枠プラン用：枠に予約者を追加
app.post(
  '/:facilityId/sessions/:sessionId/add-booking',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      customerName?: string;
      customerCount?: number;
    }>();

    const addCount = body.customerCount || 1;

    // セッションを取得
    const session = await c.env.DB.prepare(`
      SELECT cs.id, cs.court_id, cs.customer_count, cs.max_capacity, cs.status,
             p.is_slot_based
      FROM court_sessions cs
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE cs.id = ? AND cs.facility_id = ? AND cs.status IN ('reserved', 'in_use')
    `)
      .bind(sessionId, facilityId)
      .first<{
        id: number;
        court_id: string;
        customer_count: number;
        max_capacity: number | null;
        status: string;
        is_slot_based: number | null;
      }>();

    if (!session) {
      return c.json({ error: 'Session not found or not active' }, 404);
    }

    if (session.is_slot_based !== 1) {
      return c.json({ error: 'This session is not a slot-based session' }, 400);
    }

    // 定員チェック
    const newCount = session.customer_count + addCount;
    if (session.max_capacity && newCount > session.max_capacity) {
      return c.json({
        error: 'Capacity exceeded',
        currentCount: session.customer_count,
        maxCapacity: session.max_capacity,
        requestedAdd: addCount,
      }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    // customer_countを更新、customer_nameは追記（カンマ区切り）
    let updateQuery: string;
    const values: (string | number | null)[] = [];

    if (body.customerName) {
      updateQuery = `
        UPDATE court_sessions
        SET customer_count = customer_count + ?,
            customer_name = CASE
              WHEN customer_name IS NULL OR customer_name = '' THEN ?
              ELSE customer_name || ', ' || ?
            END,
            updated_at = ?
        WHERE id = ?
      `;
      values.push(addCount, body.customerName, body.customerName, now, sessionId);
    } else {
      updateQuery = `
        UPDATE court_sessions
        SET customer_count = customer_count + ?, updated_at = ?
        WHERE id = ?
      `;
      values.push(addCount, now, sessionId);
    }

    await c.env.DB.prepare(updateQuery).bind(...values).run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'BOOKING_ADDED',
      sessionId: Number(sessionId),
      courtId: session.court_id,
      customerName: body.customerName,
      addedCount: addCount,
      newTotalCount: newCount,
      maxCapacity: session.max_capacity,
    });

    return c.json({
      success: true,
      newCount,
      maxCapacity: session.max_capacity,
    });
  }
);

// セッション（枠）を削除/キャンセル
app.delete(
  '/:facilityId/sessions/:sessionId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');

    // セッションを取得
    const session = await c.env.DB.prepare(`
      SELECT id, court_id, status, customer_count
      FROM court_sessions
      WHERE id = ? AND facility_id = ? AND status IN ('locking', 'reserved', 'in_use')
    `)
      .bind(sessionId, facilityId)
      .first<{ id: number; court_id: string; status: string; customer_count: number }>();

    if (!session) {
      return c.json({ error: 'Session not found or already completed' }, 404);
    }

    // 使用中のセッションは削除不可（終了処理を使う）
    if (session.status === 'in_use') {
      return c.json({ error: 'Cannot delete in-use session. Use complete endpoint instead.' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    // セッションをキャンセル状態に更新（物理削除ではなく論理削除）
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET status = 'cancelled', updated_at = ?
      WHERE id = ?
    `)
      .bind(now, sessionId)
      .run();

    // 関連するアサインメントもキャンセル
    await c.env.DB.prepare(`
      UPDATE session_assignments
      SET status = 'cancelled'
      WHERE session_id = ? AND status IN ('scheduled', 'active')
    `)
      .bind(sessionId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'SESSION_CANCELLED',
      sessionId: Number(sessionId),
      courtId: session.court_id,
    });

    return c.json({ success: true });
  }
);

// スロットベースのセッションの予約人数を更新
app.patch(
  '/:facilityId/sessions/:sessionId/update-count',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{ customerCount: number; customerName?: string }>();

    const newCount = body.customerCount ?? 0;

    // セッションを取得
    const session = await c.env.DB.prepare(`
      SELECT cs.id, cs.court_id, cs.customer_count, cs.max_capacity, cs.status,
             p.is_slot_based
      FROM court_sessions cs
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE cs.id = ? AND cs.facility_id = ? AND cs.status IN ('reserved', 'in_use')
    `)
      .bind(sessionId, facilityId)
      .first<{
        id: number;
        court_id: string;
        customer_count: number;
        max_capacity: number | null;
        status: string;
        is_slot_based: number | null;
      }>();

    if (!session) {
      return c.json({ error: 'Session not found or not active' }, 404);
    }

    if (session.is_slot_based !== 1) {
      return c.json({ error: 'This session is not a slot-based session' }, 400);
    }

    // 定員チェック
    if (session.max_capacity && newCount > session.max_capacity) {
      return c.json({
        error: 'Capacity exceeded',
        maxCapacity: session.max_capacity,
        requestedCount: newCount,
      }, 400);
    }

    if (newCount < 0) {
      return c.json({ error: 'Count cannot be negative' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    // customer_countを更新
    if (body.customerName !== undefined) {
      await c.env.DB.prepare(`
        UPDATE court_sessions
        SET customer_count = ?, customer_name = ?, updated_at = ?
        WHERE id = ?
      `)
        .bind(newCount, body.customerName, now, sessionId)
        .run();
    } else {
      await c.env.DB.prepare(`
        UPDATE court_sessions
        SET customer_count = ?, updated_at = ?
        WHERE id = ?
      `)
        .bind(newCount, now, sessionId)
        .run();
    }

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'BOOKING_UPDATED',
      sessionId: Number(sessionId),
      courtId: session.court_id,
      newCount,
      maxCapacity: session.max_capacity,
      customerName: body.customerName,
    });

    return c.json({
      success: true,
      newCount,
      maxCapacity: session.max_capacity,
    });
  }
);

// スロットベースのセッションの定員を更新
app.patch(
  '/:facilityId/sessions/:sessionId/update-capacity',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{ maxCapacity: number }>();

    const newCapacity = body.maxCapacity;

    if (newCapacity < 1) {
      return c.json({ error: 'Capacity must be at least 1' }, 400);
    }

    // セッションを取得
    const session = await c.env.DB.prepare(`
      SELECT cs.id, cs.court_id, cs.customer_count, cs.max_capacity, cs.status,
             p.is_slot_based
      FROM court_sessions cs
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE cs.id = ? AND cs.facility_id = ? AND cs.status IN ('reserved', 'in_use')
    `)
      .bind(sessionId, facilityId)
      .first<{
        id: number;
        court_id: string;
        customer_count: number;
        max_capacity: number | null;
        status: string;
        is_slot_based: number | null;
      }>();

    if (!session) {
      return c.json({ error: 'Session not found or not active' }, 404);
    }

    if (session.is_slot_based !== 1) {
      return c.json({ error: 'This session is not a slot-based session' }, 400);
    }

    // 現在の予約人数より少ない定員には変更できない
    if (newCapacity < session.customer_count) {
      return c.json({
        error: 'Cannot reduce capacity below current booking count',
        currentCount: session.customer_count,
        requestedCapacity: newCapacity,
      }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    // max_capacityを更新
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET max_capacity = ?, updated_at = ?
      WHERE id = ?
    `)
      .bind(newCapacity, now, sessionId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'CAPACITY_UPDATED',
      sessionId: Number(sessionId),
      courtId: session.court_id,
      maxCapacity: newCapacity,
      currentCount: session.customer_count,
    });

    return c.json({
      success: true,
      maxCapacity: newCapacity,
      currentCount: session.customer_count,
    });
  }
);

// セッションのタイムラインを取得
app.get(
  '/:facilityId/sessions/:sessionId/timeline',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');

    // セッションの存在確認
    const session = await c.env.DB.prepare(`
      SELECT id FROM court_sessions WHERE id = ? AND facility_id = ?
    `)
      .bind(sessionId, facilityId)
      .first();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const timeline = await c.env.DB.prepare(`
      SELECT * FROM session_staff_timeline WHERE session_id = ?
    `)
      .bind(sessionId)
      .all();

    return c.json({ timeline: timeline.results });
  }
);

// セッションのオプション一覧を取得
app.get(
  '/:facilityId/sessions/:sessionId/options',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');

    // セッションの存在確認
    const session = await c.env.DB.prepare(`
      SELECT id FROM court_sessions WHERE id = ? AND facility_id = ?
    `)
      .bind(sessionId, facilityId)
      .first();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const result = await c.env.DB.prepare(`
      SELECT
        so.id,
        so.option_id,
        so.quantity,
        po.name AS option_name,
        po.price AS option_price
      FROM session_options so
      JOIN plan_options po ON so.option_id = po.id
      WHERE so.session_id = ?
    `)
      .bind(sessionId)
      .all();

    const options = result.results.map((opt: Record<string, unknown>) => ({
      id: opt.id,
      optionId: opt.option_id,
      optionName: opt.option_name,
      optionPrice: opt.option_price,
      quantity: opt.quantity,
    }));

    return c.json({ options });
  }
);

// セッションにオプションを設定（一括更新）
app.put(
  '/:facilityId/sessions/:sessionId/options',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{
      options: Array<{ optionId: string; quantity: number }>;
    }>();

    // セッションの存在確認
    const session = await c.env.DB.prepare(`
      SELECT id FROM court_sessions WHERE id = ? AND facility_id = ?
    `)
      .bind(sessionId, facilityId)
      .first();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // 既存のオプションを削除
    await c.env.DB.prepare(`
      DELETE FROM session_options WHERE session_id = ?
    `)
      .bind(sessionId)
      .run();

    // 新しいオプションを追加
    if (body.options && body.options.length > 0) {
      const statements = body.options
        .filter((opt) => opt.quantity > 0)
        .map((opt) =>
          c.env.DB.prepare(`
            INSERT INTO session_options (session_id, option_id, quantity)
            VALUES (?, ?, ?)
          `).bind(sessionId, opt.optionId, opt.quantity)
        );

      if (statements.length > 0) {
        await c.env.DB.batch(statements);
      }
    }

    return c.json({ success: true });
  }
);

// セッションIDベースで予約確定（lockして取得したsessionIdから予約）
app.post(
  '/:facilityId/sessions/:sessionId/reserve',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const user = c.get('user');
    const body = await c.req.json<{
      planId?: string;
      customerName?: string;
      customerCount?: number;
      startTime?: number;
      estimatedEndTime?: number;
      maxCapacity?: number;
      displayColor?: string;
      memo?: string;
      paymentStatus?: 'paid' | 'unpaid';
    }>();

    const now = Math.floor(Date.now() / 1000);

    // ロック中のセッションを取得
    const session = await c.env.DB.prepare(`
      SELECT id, court_id, locked_by
      FROM court_sessions
      WHERE id = ? AND facility_id = ? AND status = 'locking' AND locked_by = ?
    `)
      .bind(sessionId, facilityId, user.id)
      .first<{ id: number; court_id: string; locked_by: string }>();

    if (!session) {
      return c.json({ error: 'No active lock found for this session' }, 404);
    }

    // 時間帯の重複チェック（同じコートで既存の予約と時間が重複しないか確認）
    const startTime = body.startTime || now;
    const endTime = body.estimatedEndTime;
    if (startTime && endTime) {
      const overlapping = await c.env.DB.prepare(`
        SELECT id, start_time, estimated_end_time, customer_name
        FROM court_sessions
        WHERE court_id = ? AND id != ? AND status IN ('reserved', 'in_use')
          AND start_time < ? AND estimated_end_time > ?
      `)
        .bind(session.court_id, session.id, endTime, startTime)
        .first();

      if (overlapping) {
        return c.json({
          error: 'この時間帯には既に予約があります',
          conflictingSession: {
            id: overlapping.id,
            startTime: overlapping.start_time,
            endTime: overlapping.estimated_end_time,
            customerName: overlapping.customer_name,
          },
        }, 409);
      }
    }

    // プラン名を取得
    let planName: string | undefined;
    if (body.planId) {
      const plan = await c.env.DB.prepare(`
        SELECT name FROM plans WHERE id = ?
      `)
        .bind(body.planId)
        .first<{ name: string }>();
      planName = plan?.name;
    }

    // 予約確定
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET
        status = 'reserved',
        plan_id = ?,
        customer_name = ?,
        customer_count = ?,
        start_time = ?,
        estimated_end_time = ?,
        max_capacity = ?,
        display_color = ?,
        memo = ?,
        payment_status = ?,
        locked_by = NULL,
        locked_at = NULL,
        lock_expires_at = NULL,
        updated_at = ?
      WHERE id = ?
    `)
      .bind(
        body.planId || null,
        body.customerName || null,
        body.customerCount || 1,
        body.startTime || now,
        body.estimatedEndTime || null,
        body.maxCapacity || null,
        body.displayColor || null,
        body.memo || null,
        body.paymentStatus || 'unpaid',
        now,
        session.id
      )
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'COURT_RESERVED',
      courtId: session.court_id,
      sessionId: session.id,
      customerName: body.customerName,
      customerCount: body.customerCount || 1,
      startTime: body.startTime || now,
      estimatedEndTime: body.estimatedEndTime,
      displayColor: body.displayColor,
      planId: body.planId,
      planName,
      paymentStatus: body.paymentStatus || 'unpaid',
    });

    return c.json({ sessionId: session.id });
  }
);

// セッションを別のコートに移動
app.patch(
  '/:facilityId/sessions/:sessionId/move',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const body = await c.req.json<{ targetCourtId: string }>();

    if (!body.targetCourtId) {
      return c.json({ error: 'targetCourtId is required' }, 400);
    }

    // セッションの存在確認
    const session = await c.env.DB.prepare(`
      SELECT id, court_id, start_time, estimated_end_time, status
      FROM court_sessions
      WHERE id = ? AND facility_id = ? AND status IN ('reserved', 'in_use')
    `)
      .bind(sessionId, facilityId)
      .first<{
        id: number;
        court_id: string;
        start_time: number;
        estimated_end_time: number | null;
        status: string;
      }>();

    if (!session) {
      return c.json({ error: 'Session not found or not active' }, 404);
    }

    // 同じコートへの移動は不要
    if (session.court_id === body.targetCourtId) {
      return c.json({ error: 'Session is already on this court' }, 400);
    }

    // 移動先コートの存在確認
    const targetCourt = await c.env.DB.prepare(`
      SELECT id, name FROM courts WHERE id = ? AND facility_id = ? AND is_active = 1
    `)
      .bind(body.targetCourtId, facilityId)
      .first<{ id: string; name: string }>();

    if (!targetCourt) {
      return c.json({ error: 'Target court not found' }, 404);
    }

    // 移動先コートでの時間帯重複チェック
    if (session.estimated_end_time) {
      const overlapping = await c.env.DB.prepare(`
        SELECT id, start_time, estimated_end_time, customer_name
        FROM court_sessions
        WHERE court_id = ? AND status IN ('reserved', 'in_use')
          AND start_time < ? AND estimated_end_time > ?
      `)
        .bind(body.targetCourtId, session.estimated_end_time, session.start_time)
        .first();

      if (overlapping) {
        return c.json({
          error: '移動先のコートにはこの時間帯に既に予約があります',
          conflictingSession: {
            id: overlapping.id,
            startTime: overlapping.start_time,
            endTime: overlapping.estimated_end_time,
            customerName: overlapping.customer_name,
          },
        }, 409);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const oldCourtId = session.court_id;

    // コートを更新
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET court_id = ?, court_name = ?, updated_at = ?
      WHERE id = ?
    `)
      .bind(body.targetCourtId, targetCourt.name, now, sessionId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'SESSION_MOVED',
      sessionId: Number(sessionId),
      oldCourtId,
      newCourtId: body.targetCourtId,
      newCourtName: targetCourt.name,
    });

    return c.json({
      success: true,
      oldCourtId,
      newCourtId: body.targetCourtId,
      newCourtName: targetCourt.name,
    });
  }
);

// 2つのセッションのコートを入れ替え
app.post(
  '/:facilityId/sessions/swap-courts',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{ sessionId1: string; sessionId2: string }>();

    if (!body.sessionId1 || !body.sessionId2) {
      return c.json({ error: 'sessionId1 and sessionId2 are required' }, 400);
    }

    if (body.sessionId1 === body.sessionId2) {
      return c.json({ error: 'Cannot swap a session with itself' }, 400);
    }

    // 両方のセッションを取得
    const session1 = await c.env.DB.prepare(`
      SELECT id, court_id, court_name, status
      FROM court_sessions
      WHERE id = ? AND facility_id = ? AND status IN ('reserved', 'in_use')
    `)
      .bind(body.sessionId1, facilityId)
      .first<{ id: number; court_id: string; court_name: string; status: string }>();

    const session2 = await c.env.DB.prepare(`
      SELECT id, court_id, court_name, status
      FROM court_sessions
      WHERE id = ? AND facility_id = ? AND status IN ('reserved', 'in_use')
    `)
      .bind(body.sessionId2, facilityId)
      .first<{ id: number; court_id: string; court_name: string; status: string }>();

    if (!session1 || !session2) {
      return c.json({ error: 'One or both sessions not found or not active' }, 404);
    }

    // 同じコートの場合は入れ替え不要
    if (session1.court_id === session2.court_id) {
      return c.json({ error: 'Both sessions are already on the same court' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    // トランザクション的にバッチ更新
    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE court_sessions
        SET court_id = ?, court_name = ?, updated_at = ?
        WHERE id = ?
      `).bind(session2.court_id, session2.court_name, now, session1.id),
      c.env.DB.prepare(`
        UPDATE court_sessions
        SET court_id = ?, court_name = ?, updated_at = ?
        WHERE id = ?
      `).bind(session1.court_id, session1.court_name, now, session2.id),
    ]);

    // SSEブロードキャスト（2つのイベントを送信）
    broadcastToFacility(facilityId, {
      type: 'SESSION_MOVED',
      sessionId: session1.id,
      oldCourtId: session1.court_id,
      newCourtId: session2.court_id,
      newCourtName: session2.court_name,
    });

    broadcastToFacility(facilityId, {
      type: 'SESSION_MOVED',
      sessionId: session2.id,
      oldCourtId: session2.court_id,
      newCourtId: session1.court_id,
      newCourtName: session1.court_name,
    });

    return c.json({
      success: true,
      session1: {
        id: session1.id,
        oldCourtId: session1.court_id,
        newCourtId: session2.court_id,
      },
      session2: {
        id: session2.id,
        oldCourtId: session2.court_id,
        newCourtId: session1.court_id,
      },
    });
  }
);

export default app;
