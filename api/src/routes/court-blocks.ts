/**
 * コートブロック管理APIルート
 *
 * コートの利用不可時間帯（ブロック）のCRUD操作
 * - 日付指定または曜日指定（繰り返し）のブロック
 * - 特定コートまたは全コート対象
 *
 * @module routes/court-blocks
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';
import { broadcastToFacility } from '../lib/sse';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/court-blocks
 * コートブロック一覧を取得
 */
app.get(
  '/:facilityId/court-blocks',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const date = c.req.query('date');
    const courtId = c.req.query('courtId');
    const includeRecurring = c.req.query('includeRecurring') !== 'false';

    let query = `
      SELECT
        cb.id,
        cb.facility_id,
        cb.court_id,
        cb.date,
        cb.day_of_week,
        cb.start_time,
        cb.end_time,
        cb.reason,
        cb.block_type,
        cb.is_active,
        cb.created_at,
        cb.created_by,
        c.name AS court_name,
        u.name AS created_by_name
      FROM court_blocks cb
      LEFT JOIN courts c ON cb.court_id = c.id
      LEFT JOIN user u ON cb.created_by = u.id
      WHERE cb.facility_id = ? AND cb.is_active = 1
    `;

    const params: (string | null)[] = [facilityId];

    // 日付フィルター
    if (date) {
      // 日付文字列をJSTとして解釈して曜日を取得
      const dayOfWeek = new Date(date + 'T00:00:00+09:00').getDay();
      if (includeRecurring) {
        // 指定日付のブロックと、その曜日の繰り返しブロックを取得
        query += ` AND (cb.date = ? OR (cb.date IS NULL AND cb.day_of_week = ?))`;
        params.push(date, dayOfWeek.toString());
      } else {
        query += ` AND cb.date = ?`;
        params.push(date);
      }
    }

    // コートフィルター
    if (courtId) {
      query += ` AND (cb.court_id = ? OR cb.court_id IS NULL)`;
      params.push(courtId);
    }

    query += ` ORDER BY cb.start_time`;

    const blocks = await c.env.DB.prepare(query)
      .bind(...params)
      .all();

    // スネークケースからキャメルケースに変換
    const formattedBlocks = blocks.results.map((block: Record<string, unknown>) => ({
      id: block.id,
      facilityId: block.facility_id,
      courtId: block.court_id,
      courtName: block.court_name,
      date: block.date,
      dayOfWeek: block.day_of_week,
      startTime: block.start_time,
      endTime: block.end_time,
      reason: block.reason,
      blockType: block.block_type,
      isActive: block.is_active,
      createdAt: block.created_at,
      createdBy: block.created_by,
      createdByName: block.created_by_name,
    }));

    return c.json({ blocks: formattedBlocks });
  }
);

// コートブロックを作成
app.post(
  '/:facilityId/court-blocks',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const user = c.get('user');
    const body = await c.req.json<{
      courtId?: string; // nullの場合は全コート
      date?: string; // nullの場合は繰り返し
      dayOfWeek?: number; // 0-6 (日-土)
      startTime: number;
      endTime: number;
      reason?: string;
      blockType?: 'manual' | 'maintenance' | 'closed';
    }>();

    if (!body.startTime || !body.endTime) {
      return c.json({ error: 'startTime and endTime are required' }, 400);
    }

    if (body.startTime >= body.endTime) {
      return c.json({ error: 'startTime must be before endTime' }, 400);
    }

    // 繰り返しブロックの場合はdayOfWeekが必須
    if (!body.date && body.dayOfWeek === undefined) {
      return c.json({ error: 'dayOfWeek is required for recurring blocks' }, 400);
    }

    const id = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO court_blocks (
        id, facility_id, court_id, date, day_of_week,
        start_time, end_time, reason, block_type, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        facilityId,
        body.courtId || null,
        body.date || null,
        body.date ? null : body.dayOfWeek,
        body.startTime,
        body.endTime,
        body.reason || null,
        body.blockType || 'manual',
        user.id
      )
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'COURT_BLOCK_CREATED',
      blockId: id,
      courtId: body.courtId,
      date: body.date,
      dayOfWeek: body.dayOfWeek,
      startTime: body.startTime,
      endTime: body.endTime,
    });

    return c.json({ id }, 201);
  }
);

// コートブロックを更新
app.patch(
  '/:facilityId/court-blocks/:blockId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const blockId = c.req.param('blockId');
    const body = await c.req.json<{
      courtId?: string | null;
      date?: string | null;
      dayOfWeek?: number | null;
      startTime?: number;
      endTime?: number;
      reason?: string;
      blockType?: 'manual' | 'maintenance' | 'closed';
      isActive?: boolean;
    }>();

    // ブロックの存在確認
    const existing = await c.env.DB.prepare(`
      SELECT id FROM court_blocks WHERE id = ? AND facility_id = ?
    `)
      .bind(blockId, facilityId)
      .first();

    if (!existing) {
      return c.json({ error: 'Block not found' }, 404);
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.courtId !== undefined) {
      updates.push('court_id = ?');
      values.push(body.courtId);
    }
    if (body.date !== undefined) {
      updates.push('date = ?');
      values.push(body.date);
    }
    if (body.dayOfWeek !== undefined) {
      updates.push('day_of_week = ?');
      values.push(body.dayOfWeek);
    }
    if (body.startTime !== undefined) {
      updates.push('start_time = ?');
      values.push(body.startTime);
    }
    if (body.endTime !== undefined) {
      updates.push('end_time = ?');
      values.push(body.endTime);
    }
    if (body.reason !== undefined) {
      updates.push('reason = ?');
      values.push(body.reason);
    }
    if (body.blockType !== undefined) {
      updates.push('block_type = ?');
      values.push(body.blockType);
    }
    if (body.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(body.isActive ? 1 : 0);
    }

    if (updates.length > 0) {
      values.push(blockId);
      await c.env.DB.prepare(`
        UPDATE court_blocks SET ${updates.join(', ')} WHERE id = ?
      `)
        .bind(...values)
        .run();
    }

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'COURT_BLOCK_UPDATED',
      blockId,
    });

    return c.json({ success: true });
  }
);

// コートブロックを削除
app.delete(
  '/:facilityId/court-blocks/:blockId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const blockId = c.req.param('blockId');

    // ブロックの存在確認
    const existing = await c.env.DB.prepare(`
      SELECT id FROM court_blocks WHERE id = ? AND facility_id = ?
    `)
      .bind(blockId, facilityId)
      .first();

    if (!existing) {
      return c.json({ error: 'Block not found' }, 404);
    }

    await c.env.DB.prepare(`
      DELETE FROM court_blocks WHERE id = ?
    `)
      .bind(blockId)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'COURT_BLOCK_DELETED',
      blockId,
    });

    return c.json({ success: true });
  }
);

export default app;
