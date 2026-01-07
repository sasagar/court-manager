/**
 * コート管理APIルート
 *
 * コートのCRUD操作およびリアルタイムステータス取得
 *
 * @module routes/courts
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/courts
 * コート一覧を取得
 */
app.get(
  '/:facilityId/courts',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const includeInactive = c.req.query('includeInactive') === 'true';

    let query = `
      SELECT id, name, sort_order, is_active
      FROM courts
      WHERE facility_id = ?
    `;

    if (!includeInactive) {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY sort_order, name';

    const result = await c.env.DB.prepare(query).bind(facilityId).all();

    // スネークケースからキャメルケースに変換
    const courts = result.results.map((court: Record<string, unknown>) => ({
      id: court.id,
      name: court.name,
      sortOrder: court.sort_order,
      isActive: court.is_active === 1,
    }));

    return c.json({ courts });
  }
);

// コートの現在状態を取得（セッション情報含む）
app.get(
  '/:facilityId/courts/status',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const now = Math.floor(Date.now() / 1000);

    // コートとアクティブなセッションを取得
    const courts = await c.env.DB.prepare(`
      SELECT
        c.id,
        c.name,
        c.sort_order,
        c.is_active,
        cs.id AS session_id,
        cs.customer_name,
        cs.customer_count,
        cs.start_time,
        cs.estimated_end_time,
        cs.status,
        cs.locked_by,
        cs.lock_expires_at,
        cs.plan_id,
        cs.max_capacity,
        cs.display_color,
        cs.memo,
        cs.payment_status,
        u.name AS locked_by_name,
        p.name AS plan_name,
        p.short_name AS plan_short_name,
        p.is_slot_based,
        p.color_code AS plan_color
      FROM courts c
      LEFT JOIN court_sessions cs ON c.id = cs.court_id
        AND cs.status IN ('locking', 'reserved', 'in_use')
      LEFT JOIN user u ON cs.locked_by = u.id
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE c.facility_id = ? AND c.is_active = 1
      ORDER BY c.sort_order, c.name
    `)
      .bind(facilityId)
      .all();

    // 期限切れのロックをクリア
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET status = 'available', locked_by = NULL, locked_at = NULL, lock_expires_at = NULL
      WHERE facility_id = ? AND status = 'locking' AND lock_expires_at < ?
    `)
      .bind(facilityId, now)
      .run();

    // セッションごとのアサインメント情報を取得
    const sessionIds = courts.results
      .filter((court) => court.session_id)
      .map((court) => court.session_id);

    let assignments: Record<number, unknown[]> = {};
    if (sessionIds.length > 0) {
      const assignmentResults = await c.env.DB.prepare(`
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
        .all();

      // セッションIDごとにグループ化（キャメルケースに変換）
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
    }

    // レスポンス整形
    const result = courts.results.map((court) => ({
      id: court.id,
      name: court.name,
      sortOrder: court.sort_order,
      isActive: court.is_active === 1,
      currentSession: court.session_id
        ? {
            id: court.session_id,
            customerName: court.customer_name,
            customerCount: court.customer_count,
            startTime: court.start_time,
            estimatedEndTime: court.estimated_end_time,
            status: court.status,
            lockedBy: court.locked_by,
            lockedByName: court.locked_by_name,
            lockExpiresAt: court.lock_expires_at,
            planId: court.plan_id,
            planName: court.plan_name,
            planShortName: court.plan_short_name,
            isSlotBased: court.is_slot_based === 1,
            maxCapacity: court.max_capacity,
            displayColor: court.display_color || court.plan_color,
            memo: court.memo,
            paymentStatus: court.payment_status || 'unpaid',
            assignments: assignments[court.session_id as number] || [],
          }
        : null,
    }));

    return c.json({ courts: result });
  }
);

// コートを作成
app.post(
  '/:facilityId/courts',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{
      name: string;
      sortOrder?: number;
    }>();

    if (!body.name) {
      return c.json({ error: 'name is required' }, 400);
    }

    const id = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO courts (id, facility_id, name, sort_order)
      VALUES (?, ?, ?, ?)
    `)
      .bind(id, facilityId, body.name, body.sortOrder || 0)
      .run();

    return c.json({ id, name: body.name }, 201);
  }
);

// コートを更新
app.patch(
  '/:facilityId/courts/:courtId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const courtId = c.req.param('courtId');
    const body = await c.req.json<{
      name?: string;
      sortOrder?: number;
      isActive?: boolean;
    }>();

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      values.push(body.sortOrder);
    }
    if (body.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(body.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(courtId, facilityId);

    const result = await c.env.DB.prepare(`
      UPDATE courts SET ${updates.join(', ')} WHERE id = ? AND facility_id = ?
    `)
      .bind(...values)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Court not found' }, 404);
    }

    return c.json({ success: true });
  }
);

// コートを削除
app.delete(
  '/:facilityId/courts/:courtId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const courtId = c.req.param('courtId');

    // アクティブなセッションがあるか確認
    const activeSession = await c.env.DB.prepare(`
      SELECT id FROM court_sessions
      WHERE court_id = ? AND status IN ('locking', 'reserved', 'in_use')
      LIMIT 1
    `)
      .bind(courtId)
      .first();

    if (activeSession) {
      // アクティブなセッションがある場合は無効化のみ
      await c.env.DB.prepare(`
        UPDATE courts SET is_active = 0 WHERE id = ? AND facility_id = ?
      `)
        .bind(courtId, facilityId)
        .run();

      return c.json({ success: true, deactivated: true });
    }

    // セッション履歴があるか確認
    const hasHistory = await c.env.DB.prepare(`
      SELECT id FROM court_sessions WHERE court_id = ? LIMIT 1
    `)
      .bind(courtId)
      .first();

    if (hasHistory) {
      // 履歴がある場合は無効化のみ
      await c.env.DB.prepare(`
        UPDATE courts SET is_active = 0 WHERE id = ? AND facility_id = ?
      `)
        .bind(courtId, facilityId)
        .run();

      return c.json({ success: true, deactivated: true });
    }

    // 履歴がなければ完全削除
    const result = await c.env.DB.prepare(`
      DELETE FROM courts WHERE id = ? AND facility_id = ?
    `)
      .bind(courtId, facilityId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Court not found' }, 404);
    }

    return c.json({ success: true });
  }
);

export default app;
