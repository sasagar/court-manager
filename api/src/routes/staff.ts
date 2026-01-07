/**
 * スタッフ管理APIルート
 *
 * スタッフのCRUD操作およびステータス管理
 * - スタッフの作成・更新・削除
 * - 並び順変更
 * - 稼働ステータス変更（待機・対応中・休憩）
 *
 * @module routes/staff
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';
import { broadcastToFacility } from '../lib/sse';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/staff
 * スタッフ一覧を取得
 */
app.get(
  '/:facilityId/staff',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const includeInactive = c.req.query('includeInactive') === 'true';

    let query = `
      SELECT
        st.id,
        st.display_name,
        st.employee_id,
        st.color_code,
        st.phone,
        st.user_id,
        st.image_url,
        st.is_active,
        sf.role,
        sf.sort_order,
        sa.status AS activity_status,
        sa.current_session_id
      FROM staff st
      JOIN staff_facilities sf ON st.id = sf.staff_id
      LEFT JOIN staff_activity sa ON st.id = sa.staff_id AND sa.facility_id = ?
      WHERE sf.facility_id = ?
    `;

    if (!includeInactive) {
      query += ' AND st.is_active = 1';
    }

    query += ' ORDER BY sf.sort_order ASC, st.display_name ASC';

    const result = await c.env.DB.prepare(query)
      .bind(facilityId, facilityId)
      .all();

    // スネークケース→キャメルケースに変換
    const staff = result.results.map((row: Record<string, unknown>) => ({
      id: row.id,
      displayName: row.display_name,
      employeeId: row.employee_id,
      colorCode: row.color_code,
      phone: row.phone,
      userId: row.user_id,
      imageUrl: row.image_url,
      isActive: row.is_active === 1,
      role: row.role,
      sortOrder: row.sort_order ?? 0,
      activityStatus: row.activity_status,
      currentSessionId: row.current_session_id,
    }));

    return c.json({ staff });
  }
);

// スタッフ詳細を取得
app.get(
  '/:facilityId/staff/:staffId',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const staffId = c.req.param('staffId');

    const staff = await c.env.DB.prepare(`
      SELECT
        st.id,
        st.display_name,
        st.employee_id,
        st.color_code,
        st.phone,
        st.emergency_contact,
        st.user_id,
        st.image_url,
        st.hired_date,
        st.notes,
        st.is_active,
        sf.role
      FROM staff st
      JOIN staff_facilities sf ON st.id = sf.staff_id
      WHERE st.id = ? AND sf.facility_id = ?
    `)
      .bind(staffId, facilityId)
      .first();

    if (!staff) {
      return c.json({ error: 'Staff not found' }, 404);
    }

    return c.json({ staff });
  }
);

// スタッフを作成（アカウント紐付けなし）
app.post(
  '/:facilityId/staff',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{
      displayName: string;
      employeeId?: string;
      colorCode?: string;
      phone?: string;
      emergencyContact?: string;
      hiredDate?: string;
      notes?: string;
      imageUrl?: string;
      role?: 'admin' | 'staff' | 'viewer';
    }>();

    if (!body.displayName) {
      return c.json({ error: 'displayName is required' }, 400);
    }

    const id = crypto.randomUUID();

    // スタッフマスタに追加
    await c.env.DB.prepare(`
      INSERT INTO staff (id, display_name, employee_id, color_code, phone, emergency_contact, hired_date, notes, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        body.displayName,
        body.employeeId || null,
        body.colorCode || null,
        body.phone || null,
        body.emergencyContact || null,
        body.hiredDate || null,
        body.notes || null,
        body.imageUrl || null
      )
      .run();

    // 施設との関連を作成
    await c.env.DB.prepare(`
      INSERT INTO staff_facilities (id, staff_id, facility_id, role)
      VALUES (?, ?, ?, ?)
    `)
      .bind(crypto.randomUUID(), id, facilityId, body.role || 'staff')
      .run();

    return c.json({ id }, 201);
  }
);

// スタッフを更新
app.patch(
  '/:facilityId/staff/:staffId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const staffId = c.req.param('staffId');
    const body = await c.req.json<{
      displayName?: string;
      employeeId?: string;
      colorCode?: string;
      phone?: string;
      emergencyContact?: string;
      hiredDate?: string;
      notes?: string;
      imageUrl?: string | null;
      isActive?: boolean;
      userId?: string | null;
      role?: 'admin' | 'staff' | 'viewer';
    }>();

    // スタッフの存在確認
    const exists = await c.env.DB.prepare(`
      SELECT sf.id FROM staff_facilities sf WHERE sf.staff_id = ? AND sf.facility_id = ?
    `)
      .bind(staffId, facilityId)
      .first();

    if (!exists) {
      return c.json({ error: 'Staff not found' }, 404);
    }

    // スタッフマスタを更新
    const staffUpdates: string[] = [];
    const staffValues: (string | number | null)[] = [];

    if (body.displayName !== undefined) {
      staffUpdates.push('display_name = ?');
      staffValues.push(body.displayName);
    }
    if (body.employeeId !== undefined) {
      staffUpdates.push('employee_id = ?');
      staffValues.push(body.employeeId);
    }
    if (body.colorCode !== undefined) {
      staffUpdates.push('color_code = ?');
      staffValues.push(body.colorCode);
    }
    if (body.phone !== undefined) {
      staffUpdates.push('phone = ?');
      staffValues.push(body.phone);
    }
    if (body.emergencyContact !== undefined) {
      staffUpdates.push('emergency_contact = ?');
      staffValues.push(body.emergencyContact);
    }
    if (body.hiredDate !== undefined) {
      staffUpdates.push('hired_date = ?');
      staffValues.push(body.hiredDate);
    }
    if (body.notes !== undefined) {
      staffUpdates.push('notes = ?');
      staffValues.push(body.notes);
    }
    if (body.imageUrl !== undefined) {
      staffUpdates.push('image_url = ?');
      staffValues.push(body.imageUrl);
    }
    if (body.isActive !== undefined) {
      staffUpdates.push('is_active = ?');
      staffValues.push(body.isActive ? 1 : 0);
    }
    if (body.userId !== undefined) {
      staffUpdates.push('user_id = ?');
      staffValues.push(body.userId);
    }

    if (staffUpdates.length > 0) {
      staffValues.push(staffId);
      await c.env.DB.prepare(`
        UPDATE staff SET ${staffUpdates.join(', ')} WHERE id = ?
      `)
        .bind(...staffValues)
        .run();
    }

    // 施設ロールを更新
    if (body.role !== undefined) {
      await c.env.DB.prepare(`
        UPDATE staff_facilities SET role = ? WHERE staff_id = ? AND facility_id = ?
      `)
        .bind(body.role, staffId, facilityId)
        .run();
    }

    return c.json({ success: true });
  }
);

// スタッフを削除
app.delete(
  '/:facilityId/staff/:staffId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const staffId = c.req.param('staffId');

    try {
      // スタッフの存在確認
      const exists = await c.env.DB.prepare(`
        SELECT sf.id FROM staff_facilities sf WHERE sf.staff_id = ? AND sf.facility_id = ?
      `)
        .bind(staffId, facilityId)
        .first();

      if (!exists) {
        return c.json({ error: 'Staff not found' }, 404);
      }

      // 現在アサインされているセッション（アクティブなもの）がないか確認
      const activeAssignment = await c.env.DB.prepare(`
        SELECT sa.id FROM session_assignments sa
        JOIN shifts sh ON sa.shift_id = sh.id
        WHERE sh.staff_id = ? AND sa.status IN ('scheduled', 'active')
      `)
        .bind(staffId)
        .first();

      if (activeAssignment) {
        return c.json({ error: 'このスタッフは現在セッションにアサインされています。先にアサインを解除してください。' }, 400);
      }

      // staff_activityを削除
      await c.env.DB.prepare(`DELETE FROM staff_activity WHERE staff_id = ?`)
        .bind(staffId)
        .run();

      // この施設のシフトに関連するsession_assignmentsを削除
      await c.env.DB.prepare(`
        DELETE FROM session_assignments WHERE shift_id IN (
          SELECT id FROM shifts WHERE staff_id = ? AND facility_id = ?
        )
      `)
        .bind(staffId, facilityId)
        .run();

      // この施設のシフトを削除
      await c.env.DB.prepare(`DELETE FROM shifts WHERE staff_id = ? AND facility_id = ?`)
        .bind(staffId, facilityId)
        .run();

      // staff_facilitiesから削除
      await c.env.DB.prepare(`DELETE FROM staff_facilities WHERE staff_id = ? AND facility_id = ?`)
        .bind(staffId, facilityId)
        .run();

      // 他の施設との関連がなければstaffマスタからも削除
      const otherFacilities = await c.env.DB.prepare(`
        SELECT id FROM staff_facilities WHERE staff_id = ?
      `)
        .bind(staffId)
        .first();

      if (!otherFacilities) {
        // 他施設のシフト・アサインメントも削除（CASCADEで削除されるはずだが念のため）
        await c.env.DB.prepare(`
          DELETE FROM session_assignments WHERE shift_id IN (
            SELECT id FROM shifts WHERE staff_id = ?
          )
        `)
          .bind(staffId)
          .run();

        await c.env.DB.prepare(`DELETE FROM shifts WHERE staff_id = ?`)
          .bind(staffId)
          .run();

        await c.env.DB.prepare(`DELETE FROM staff WHERE id = ?`)
          .bind(staffId)
          .run();
      }

      return c.json({ success: true });
    } catch (err) {
      console.error('Failed to delete staff:', err);
      return c.json({ error: 'スタッフの削除に失敗しました' }, 500);
    }
  }
);

// スタッフの並び順を更新
app.put(
  '/:facilityId/staff/reorder',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{
      staffIds: string[];
    }>();

    if (!body.staffIds || !Array.isArray(body.staffIds)) {
      return c.json({ error: 'staffIds array is required' }, 400);
    }

    // 各スタッフのsort_orderを更新
    for (let i = 0; i < body.staffIds.length; i++) {
      await c.env.DB.prepare(`
        UPDATE staff_facilities SET sort_order = ? WHERE staff_id = ? AND facility_id = ?
      `)
        .bind(i, body.staffIds[i], facilityId)
        .run();
    }

    return c.json({ success: true });
  }
);

// スタッフステータスを変更（休憩など）
app.post(
  '/:facilityId/staff/:staffId/status',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const staffId = c.req.param('staffId');
    const body = await c.req.json<{
      status: 'idle' | 'busy' | 'break';
    }>();

    if (!body.status || !['idle', 'busy', 'break'].includes(body.status)) {
      return c.json({ error: 'Invalid status' }, 400);
    }

    const now = Math.floor(Date.now() / 1000);

    // staff_activityを更新または作成
    await c.env.DB.prepare(`
      INSERT INTO staff_activity (staff_id, facility_id, status, last_updated)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (staff_id) DO UPDATE SET
        status = excluded.status,
        last_updated = excluded.last_updated
    `)
      .bind(staffId, facilityId, body.status, now)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'STAFF_STATUS_CHANGED',
      staffId,
      status: body.status,
    });

    return c.json({ success: true });
  }
);

export default app;
