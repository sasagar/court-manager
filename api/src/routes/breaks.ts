/**
 * スタッフ休憩管理APIルート
 *
 * シフト中の予定休憩のCRUD操作
 * - 休憩の取得・作成・更新・削除
 *
 * @module routes/breaks
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';
import { broadcastToFacility } from '../lib/sse';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/breaks
 * 休憩一覧取得
 */
app.get(
  '/:facilityId/breaks',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const date = c.req.query('date');

    let query = `
      SELECT
        sb.id,
        sb.shift_id,
        sb.start_time,
        sb.end_time,
        sb.memo,
        s.staff_id,
        st.display_name AS staff_name
      FROM scheduled_breaks sb
      JOIN shifts s ON sb.shift_id = s.id
      JOIN staff st ON s.staff_id = st.id
      WHERE sb.facility_id = ?
    `;
    const params: (string | number)[] = [facilityId];

    if (date) {
      const startOfDay = new Date(date + 'T00:00:00').getTime() / 1000;
      const endOfDay = new Date(date + 'T23:59:59').getTime() / 1000;
      query += ` AND sb.start_time >= ? AND sb.start_time < ?`;
      params.push(startOfDay, endOfDay);
    }

    query += ` ORDER BY sb.start_time`;

    const result = await c.env.DB.prepare(query).bind(...params).all();
    return c.json({ breaks: result.results });
  }
);

// 休憩作成
app.post(
  '/:facilityId/breaks',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const user = c.get('user');
    const body = await c.req.json<{
      shiftId: string;
      startTime: number;
      endTime: number;
      memo?: string;
    }>();

    if (!body.shiftId || !body.startTime || !body.endTime) {
      return c.json({ error: 'shiftId, startTime, and endTime are required' }, 400);
    }

    if (body.startTime >= body.endTime) {
      return c.json({ error: 'startTime must be before endTime' }, 400);
    }

    // シフトの存在確認
    const shift = await c.env.DB.prepare(`
      SELECT s.id, s.staff_id, st.display_name AS staff_name
      FROM shifts s
      JOIN staff st ON s.staff_id = st.id
      WHERE s.id = ? AND s.facility_id = ?
    `)
      .bind(body.shiftId, facilityId)
      .first<{ id: string; staff_id: string; staff_name: string }>();

    if (!shift) {
      return c.json({ error: 'Shift not found' }, 404);
    }

    // 休憩を作成
    const result = await c.env.DB.prepare(`
      INSERT INTO scheduled_breaks (shift_id, facility_id, start_time, end_time, memo, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `)
      .bind(body.shiftId, facilityId, body.startTime, body.endTime, body.memo || null, user.id)
      .first<{ id: number }>();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'BREAK_CREATED',
      breakData: {
        id: result?.id,
        shiftId: body.shiftId,
        staffId: shift.staff_id,
        staffName: shift.staff_name,
        startTime: body.startTime,
        endTime: body.endTime,
        memo: body.memo,
      },
    });

    return c.json({ id: result?.id }, 201);
  }
);

// 休憩更新
app.put(
  '/:facilityId/breaks/:breakId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const breakId = c.req.param('breakId');
    const body = await c.req.json<{
      startTime?: number;
      endTime?: number;
      memo?: string;
    }>();

    // 休憩の存在確認
    const existingBreak = await c.env.DB.prepare(`
      SELECT sb.id, sb.shift_id, sb.start_time, sb.end_time, s.staff_id
      FROM scheduled_breaks sb
      JOIN shifts s ON sb.shift_id = s.id
      WHERE sb.id = ? AND sb.facility_id = ?
    `)
      .bind(breakId, facilityId)
      .first<{ id: number; shift_id: string; start_time: number; end_time: number; staff_id: string }>();

    if (!existingBreak) {
      return c.json({ error: 'Break not found' }, 404);
    }

    const newStartTime = body.startTime ?? existingBreak.start_time;
    const newEndTime = body.endTime ?? existingBreak.end_time;

    if (newStartTime >= newEndTime) {
      return c.json({ error: 'startTime must be before endTime' }, 400);
    }

    // 更新
    await c.env.DB.prepare(`
      UPDATE scheduled_breaks
      SET start_time = ?, end_time = ?, memo = COALESCE(?, memo)
      WHERE id = ?
    `)
      .bind(newStartTime, newEndTime, body.memo ?? null, breakId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'BREAK_UPDATED',
      breakData: {
        id: Number(breakId),
        shiftId: existingBreak.shift_id,
        staffId: existingBreak.staff_id,
        startTime: newStartTime,
        endTime: newEndTime,
        memo: body.memo,
      },
    });

    return c.json({ success: true });
  }
);

// 休憩削除
app.delete(
  '/:facilityId/breaks/:breakId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const breakId = c.req.param('breakId');

    // 休憩の存在確認
    const existingBreak = await c.env.DB.prepare(`
      SELECT sb.id, sb.shift_id, s.staff_id
      FROM scheduled_breaks sb
      JOIN shifts s ON sb.shift_id = s.id
      WHERE sb.id = ? AND sb.facility_id = ?
    `)
      .bind(breakId, facilityId)
      .first<{ id: number; shift_id: string; staff_id: string }>();

    if (!existingBreak) {
      return c.json({ error: 'Break not found' }, 404);
    }

    // 削除
    await c.env.DB.prepare(`DELETE FROM scheduled_breaks WHERE id = ?`)
      .bind(breakId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'BREAK_DELETED',
      breakId: Number(breakId),
      shiftId: existingBreak.shift_id,
      staffId: existingBreak.staff_id,
    });

    return c.json({ success: true });
  }
);

export default app;
