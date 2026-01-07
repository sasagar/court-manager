/**
 * オプショングループ管理APIルート
 *
 * プランに紐づくオプショングループのCRUD操作
 * - グループの取得・作成・更新・削除
 * - 並び順変更
 *
 * @module routes/option-groups
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/plans/:planId/option-groups
 * プランのオプショングループ一覧を取得（グループに属するオプションも含む）
 */
app.get(
  '/:facilityId/plans/:planId/option-groups',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const planId = c.req.param('planId');
    const includeInactive = c.req.query('includeInactive') === 'true';

    // グループを取得
    let groupQuery = `
      SELECT
        id,
        plan_id,
        name,
        selection_type,
        max_selections,
        is_required,
        sort_order,
        is_active,
        created_at
      FROM option_groups
      WHERE plan_id = ?
    `;

    if (!includeInactive) {
      groupQuery += ' AND is_active = 1';
    }

    groupQuery += ' ORDER BY sort_order, name';

    const groupResult = await c.env.DB.prepare(groupQuery).bind(planId).all();

    // オプションを取得
    let optionQuery = `
      SELECT
        id,
        plan_id,
        group_id,
        name,
        description,
        price,
        sort_order,
        is_active,
        is_required,
        allow_multiple,
        created_at
      FROM plan_options
      WHERE plan_id = ?
    `;

    if (!includeInactive) {
      optionQuery += ' AND is_active = 1';
    }

    optionQuery += ' ORDER BY sort_order, name';

    const optionResult = await c.env.DB.prepare(optionQuery).bind(planId).all();

    // オプションをマッピング
    const optionsMap = new Map<string | null, Array<Record<string, unknown>>>();

    for (const opt of optionResult.results) {
      const groupId = opt.group_id as string | null;
      if (!optionsMap.has(groupId)) {
        optionsMap.set(groupId, []);
      }
      optionsMap.get(groupId)!.push({
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
      });
    }

    // グループとそのオプションを結合
    const groups = groupResult.results.map((grp: Record<string, unknown>) => ({
      id: grp.id,
      planId: grp.plan_id,
      name: grp.name,
      selectionType: grp.selection_type,
      maxSelections: grp.max_selections,
      isRequired: grp.is_required === 1,
      sortOrder: grp.sort_order,
      isActive: grp.is_active === 1,
      createdAt: grp.created_at,
      options: optionsMap.get(grp.id as string) || [],
    }));

    // グループに属さないオプション
    const ungroupedOptions = optionsMap.get(null) || [];

    return c.json({ groups, ungroupedOptions });
  }
);

/**
 * POST /:facilityId/plans/:planId/option-groups
 * オプショングループを作成
 */
app.post(
  '/:facilityId/plans/:planId/option-groups',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const planId = c.req.param('planId');
    const body = await c.req.json<{
      name: string;
      selectionType?: 'single' | 'multiple';
      maxSelections?: number | null;
      isRequired?: boolean;
      sortOrder?: number;
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

    const id = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO option_groups (id, plan_id, name, selection_type, max_selections, is_required, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        planId,
        body.name,
        body.selectionType || 'single',
        body.maxSelections ?? null,
        body.isRequired ? 1 : 0,
        body.sortOrder || 0
      )
      .run();

    return c.json({ id }, 201);
  }
);

/**
 * PATCH /:facilityId/plans/:planId/option-groups/:groupId
 * オプショングループを更新
 */
app.patch(
  '/:facilityId/plans/:planId/option-groups/:groupId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const planId = c.req.param('planId');
    const groupId = c.req.param('groupId');
    const body = await c.req.json<{
      name?: string;
      selectionType?: 'single' | 'multiple';
      maxSelections?: number | null;
      isRequired?: boolean;
      sortOrder?: number;
      isActive?: boolean;
    }>();

    // グループの存在確認
    const exists = await c.env.DB.prepare(`
      SELECT id FROM option_groups WHERE id = ? AND plan_id = ?
    `)
      .bind(groupId, planId)
      .first();

    if (!exists) {
      return c.json({ error: 'Group not found' }, 404);
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.selectionType !== undefined) {
      updates.push('selection_type = ?');
      values.push(body.selectionType);
    }
    if (body.maxSelections !== undefined) {
      updates.push('max_selections = ?');
      values.push(body.maxSelections);
    }
    if (body.isRequired !== undefined) {
      updates.push('is_required = ?');
      values.push(body.isRequired ? 1 : 0);
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

    values.push(groupId, planId);

    await c.env.DB.prepare(`
      UPDATE option_groups SET ${updates.join(', ')} WHERE id = ? AND plan_id = ?
    `)
      .bind(...values)
      .run();

    return c.json({ success: true });
  }
);

/**
 * DELETE /:facilityId/plans/:planId/option-groups/:groupId
 * オプショングループを削除（グループ内のオプションは未分類に移動）
 */
app.delete(
  '/:facilityId/plans/:planId/option-groups/:groupId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const planId = c.req.param('planId');
    const groupId = c.req.param('groupId');

    // グループ内のオプションを未分類に移動（group_id = NULL）
    await c.env.DB.prepare(`
      UPDATE plan_options SET group_id = NULL WHERE group_id = ? AND plan_id = ?
    `)
      .bind(groupId, planId)
      .run();

    // グループを削除
    const result = await c.env.DB.prepare(`
      DELETE FROM option_groups WHERE id = ? AND plan_id = ?
    `)
      .bind(groupId, planId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Group not found' }, 404);
    }

    return c.json({ success: true });
  }
);

/**
 * PUT /:facilityId/plans/:planId/option-groups/reorder
 * グループの並び順を一括更新
 */
app.put(
  '/:facilityId/plans/:planId/option-groups/reorder',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const planId = c.req.param('planId');
    const body = await c.req.json<{
      groupIds: string[];
    }>();

    if (!body.groupIds || !Array.isArray(body.groupIds)) {
      return c.json({ error: 'groupIds array is required' }, 400);
    }

    const statements = body.groupIds.map((groupId, index) =>
      c.env.DB.prepare(`
        UPDATE option_groups SET sort_order = ? WHERE id = ? AND plan_id = ?
      `).bind(index, groupId, planId)
    );

    await c.env.DB.batch(statements);

    return c.json({ success: true });
  }
);

export default app;
