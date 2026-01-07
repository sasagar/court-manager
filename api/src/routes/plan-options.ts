/**
 * プランオプション管理APIルート
 *
 * プランに紐づくオプション（追加料金項目等）のCRUD操作
 * - オプションの取得・作成・更新・削除
 * - 並び順変更
 *
 * @module routes/plan-options
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/plans/:planId/options
 * プランのオプション一覧を取得
 */
app.get(
  '/:facilityId/plans/:planId/options',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const planId = c.req.param('planId');
    const includeInactive = c.req.query('includeInactive') === 'true';

    let query = `
      SELECT
        po.id,
        po.plan_id,
        po.group_id,
        po.name,
        po.description,
        po.price,
        po.sort_order,
        po.is_active,
        po.is_required,
        po.allow_multiple,
        po.created_at,
        og.name as group_name,
        og.selection_type as group_selection_type
      FROM plan_options po
      LEFT JOIN option_groups og ON po.group_id = og.id
      WHERE po.plan_id = ?
    `;

    if (!includeInactive) {
      query += ' AND po.is_active = 1';
    }

    query += ' ORDER BY po.sort_order, po.name';

    const result = await c.env.DB.prepare(query).bind(planId).all();

    const options = result.results.map((opt: Record<string, unknown>) => ({
      id: opt.id,
      planId: opt.plan_id,
      groupId: opt.group_id,
      name: opt.name,
      description: opt.description,
      price: opt.price,
      sortOrder: opt.sort_order,
      isActive: opt.is_active === 1,
      isRequired: opt.is_required === 1,
      allowMultiple: opt.allow_multiple === 1,
      createdAt: opt.created_at,
      // グループ情報（後方互換性のため残す）
      groupName: opt.group_name,
      selectionType: opt.group_selection_type || 'checkbox',
    }));

    return c.json({ options });
  }
);

// オプションを作成
app.post(
  '/:facilityId/plans/:planId/options',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const planId = c.req.param('planId');
    const body = await c.req.json<{
      name: string;
      description?: string;
      price?: number;
      sortOrder?: number;
      isRequired?: boolean;
      allowMultiple?: boolean;
      groupId?: string | null;
    }>();

    if (!body.name) {
      return c.json({ error: 'name is required' }, 400);
    }

    // プランの存在確認
    const plan = await c.env.DB.prepare(`
      SELECT id FROM plans WHERE id = ? AND facility_id = ?
    `)
      .bind(planId, facilityId)
      .first();

    if (!plan) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    // グループが指定されている場合、グループの存在確認
    if (body.groupId) {
      const group = await c.env.DB.prepare(`
        SELECT id FROM option_groups WHERE id = ? AND plan_id = ?
      `)
        .bind(body.groupId, planId)
        .first();

      if (!group) {
        return c.json({ error: 'Option group not found' }, 404);
      }
    }

    const id = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO plan_options (id, plan_id, group_id, name, description, price, sort_order, is_required, allow_multiple)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        planId,
        body.groupId || null,
        body.name,
        body.description || null,
        body.price || 0,
        body.sortOrder || 0,
        body.isRequired ? 1 : 0,
        body.allowMultiple !== false ? 1 : 0
      )
      .run();

    return c.json({ id }, 201);
  }
);

// オプションを更新
app.patch(
  '/:facilityId/plans/:planId/options/:optionId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const planId = c.req.param('planId');
    const optionId = c.req.param('optionId');
    const body = await c.req.json<{
      name?: string;
      description?: string;
      price?: number;
      sortOrder?: number;
      isActive?: boolean;
      isRequired?: boolean;
      allowMultiple?: boolean;
      groupId?: string | null;
    }>();

    // オプションの存在確認
    const exists = await c.env.DB.prepare(`
      SELECT id FROM plan_options WHERE id = ? AND plan_id = ?
    `)
      .bind(optionId, planId)
      .first();

    if (!exists) {
      return c.json({ error: 'Option not found' }, 404);
    }

    // グループが指定されている場合、グループの存在確認
    if (body.groupId) {
      const group = await c.env.DB.prepare(`
        SELECT id FROM option_groups WHERE id = ? AND plan_id = ?
      `)
        .bind(body.groupId, planId)
        .first();

      if (!group) {
        return c.json({ error: 'Option group not found' }, 404);
      }
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.price !== undefined) {
      updates.push('price = ?');
      values.push(body.price);
    }
    if (body.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      values.push(body.sortOrder);
    }
    if (body.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(body.isActive ? 1 : 0);
    }
    if (body.isRequired !== undefined) {
      updates.push('is_required = ?');
      values.push(body.isRequired ? 1 : 0);
    }
    if (body.allowMultiple !== undefined) {
      updates.push('allow_multiple = ?');
      values.push(body.allowMultiple ? 1 : 0);
    }
    if (body.groupId !== undefined) {
      updates.push('group_id = ?');
      values.push(body.groupId);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(optionId, planId);

    await c.env.DB.prepare(`
      UPDATE plan_options SET ${updates.join(', ')} WHERE id = ? AND plan_id = ?
    `)
      .bind(...values)
      .run();

    return c.json({ success: true });
  }
);

// オプションを削除
app.delete(
  '/:facilityId/plans/:planId/options/:optionId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const planId = c.req.param('planId');
    const optionId = c.req.param('optionId');

    // 使用中のセッションがあるか確認
    const inUse = await c.env.DB.prepare(`
      SELECT so.id FROM session_options so
      JOIN court_sessions cs ON so.session_id = cs.id
      WHERE so.option_id = ? AND cs.status IN ('locking', 'reserved', 'in_use')
    `)
      .bind(optionId)
      .first();

    if (inUse) {
      // 使用中の場合は論理削除
      await c.env.DB.prepare(`
        UPDATE plan_options SET is_active = 0 WHERE id = ? AND plan_id = ?
      `)
        .bind(optionId, planId)
        .run();

      return c.json({ success: true, deactivated: true });
    }

    // 物理削除
    const result = await c.env.DB.prepare(`
      DELETE FROM plan_options WHERE id = ? AND plan_id = ?
    `)
      .bind(optionId, planId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Option not found' }, 404);
    }

    return c.json({ success: true });
  }
);

// オプションの並び順を一括更新
app.put(
  '/:facilityId/plans/:planId/options/reorder',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const planId = c.req.param('planId');
    const body = await c.req.json<{
      optionIds: string[];
    }>();

    if (!body.optionIds || !Array.isArray(body.optionIds)) {
      return c.json({ error: 'optionIds array is required' }, 400);
    }

    const statements = body.optionIds.map((optionId, index) =>
      c.env.DB.prepare(`
        UPDATE plan_options SET sort_order = ? WHERE id = ? AND plan_id = ?
      `).bind(index, optionId, planId)
    );

    await c.env.DB.batch(statements);

    return c.json({ success: true });
  }
);

export default app;
