/**
 * シフト管理APIルート
 *
 * スタッフの勤務シフトのCRUD操作
 * - 日付指定・期間指定でのシフト取得
 * - シフトの作成・更新・削除
 *
 * @module routes/shifts
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/shifts/today
 * 今日のシフト一覧を取得
 */
app.get(
  '/:facilityId/shifts/today',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');

    const shifts = await c.env.DB.prepare(`
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
        sh.notes,
        sa.status AS activity_status,
        sa.current_session_id,
        (
          SELECT COUNT(*)
          FROM session_assignments sas
          WHERE sas.shift_id = sh.id AND sas.status IN ('scheduled', 'active')
        ) AS active_assignment_count
      FROM shifts sh
      JOIN staff st ON sh.staff_id = st.id
      LEFT JOIN staff_activity sa ON st.id = sa.staff_id AND sa.facility_id = ?
      WHERE sh.facility_id = ? AND sh.date = date('now')
      ORDER BY sh.start_time
    `)
      .bind(facilityId, facilityId)
      .all();

    // スネークケース→キャメルケースに変換
    const shiftsData = shifts.results.map((row: Record<string, unknown>) => ({
      id: row.id,
      staffId: row.staff_id,
      staffName: row.staff_name,
      staffColor: row.staff_color,
      staffImageUrl: row.staff_image_url,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      notes: row.notes,
      activityStatus: row.activity_status || 'idle',
      currentSessionId: row.current_session_id,
      activeAssignmentCount: row.active_assignment_count,
    }));

    return c.json({ shifts: shiftsData });
  }
);

// 指定日のシフト一覧を取得
app.get(
  '/:facilityId/shifts',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const date = c.req.query('date');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    let query = `
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
        sh.notes
      FROM shifts sh
      JOIN staff st ON sh.staff_id = st.id
      WHERE sh.facility_id = ?
    `;
    const params: (string | number)[] = [facilityId];

    if (date) {
      query += ' AND sh.date = ?';
      params.push(date);
    } else if (startDate && endDate) {
      query += ' AND sh.date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else {
      // デフォルトは今日
      query += " AND sh.date = date('now')";
    }

    query += ' ORDER BY sh.date, sh.start_time';

    const result = await c.env.DB.prepare(query).bind(...params).all();

    // スネークケース→キャメルケースに変換
    const shifts = result.results.map((row: Record<string, unknown>) => ({
      id: row.id,
      staffId: row.staff_id,
      staffName: row.staff_name,
      staffColor: row.staff_color,
      staffImageUrl: row.staff_image_url,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      notes: row.notes,
    }));

    return c.json({ shifts });
  }
);

// シフトを作成
app.post(
  '/:facilityId/shifts',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{
      staffId: string;
      date: string;
      startTime: number;
      endTime: number;
      notes?: string;
    }>();

    if (!body.staffId || !body.date || !body.startTime || !body.endTime) {
      return c.json(
        { error: 'staffId, date, startTime, and endTime are required' },
        400
      );
    }

    // スタッフが施設に所属しているか確認
    const staffFacility = await c.env.DB.prepare(`
      SELECT id FROM staff_facilities WHERE staff_id = ? AND facility_id = ?
    `)
      .bind(body.staffId, facilityId)
      .first();

    if (!staffFacility) {
      return c.json({ error: 'Staff not found in this facility' }, 404);
    }

    const id = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO shifts (id, facility_id, staff_id, date, start_time, end_time, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        facilityId,
        body.staffId,
        body.date,
        body.startTime,
        body.endTime,
        body.notes || null
      )
      .run();

    return c.json({ id }, 201);
  }
);

// シフトを更新
app.patch(
  '/:facilityId/shifts/:shiftId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const shiftId = c.req.param('shiftId');
    const body = await c.req.json<{
      startTime?: number;
      endTime?: number;
      status?: 'scheduled' | 'active' | 'completed';
      notes?: string;
    }>();

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (body.startTime !== undefined) {
      updates.push('start_time = ?');
      values.push(body.startTime);
    }
    if (body.endTime !== undefined) {
      updates.push('end_time = ?');
      values.push(body.endTime);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);
    }
    if (body.notes !== undefined) {
      updates.push('notes = ?');
      values.push(body.notes);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(shiftId, facilityId);

    const result = await c.env.DB.prepare(`
      UPDATE shifts SET ${updates.join(', ')} WHERE id = ? AND facility_id = ?
    `)
      .bind(...values)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Shift not found' }, 404);
    }

    return c.json({ success: true });
  }
);

// シフトを削除
app.delete(
  '/:facilityId/shifts/:shiftId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const shiftId = c.req.param('shiftId');

    // アクティブなアサインメントがある場合は削除不可
    const activeAssignment = await c.env.DB.prepare(`
      SELECT id FROM session_assignments
      WHERE shift_id = ? AND status IN ('scheduled', 'active')
    `)
      .bind(shiftId)
      .first();

    if (activeAssignment) {
      return c.json(
        { error: 'Cannot delete shift with active assignments' },
        409
      );
    }

    const result = await c.env.DB.prepare(`
      DELETE FROM shifts WHERE id = ? AND facility_id = ?
    `)
      .bind(shiftId, facilityId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Shift not found' }, 404);
    }

    return c.json({ success: true });
  }
);

export default app;
