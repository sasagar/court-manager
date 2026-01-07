/**
 * プラン管理APIルート
 *
 * 料金プランのCRUD操作
 * - プランの取得・作成・更新・削除
 * - プランの有効化・無効化
 * - プランの複製
 * - 並び順変更
 *
 * @module routes/plans
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/plans
 * プラン一覧を取得
 */
app.get(
  '/:facilityId/plans',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const includeInactive = c.req.query('includeInactive') === 'true';

    let query = `
      SELECT
        id,
        name,
        short_name,
        duration_minutes,
        price,
        description,
        is_active,
        sort_order,
        is_slot_based,
        max_capacity,
        color_code,
        created_at
      FROM plans
      WHERE facility_id = ?
    `;

    if (!includeInactive) {
      query += ' AND is_active = 1';
    }

    query += ' ORDER BY sort_order, name';

    const result = await c.env.DB.prepare(query).bind(facilityId).all();

    // スネークケースからキャメルケースに変換
    const plans = result.results.map((plan: Record<string, unknown>) => ({
      id: plan.id,
      name: plan.name,
      shortName: plan.short_name,
      durationMinutes: plan.duration_minutes,
      price: plan.price,
      description: plan.description,
      isActive: plan.is_active === 1,
      sortOrder: plan.sort_order,
      isSlotBased: plan.is_slot_based === 1,
      maxCapacity: plan.max_capacity,
      colorCode: plan.color_code,
      createdAt: plan.created_at,
    }));

    return c.json({ plans });
  }
);

// プラン詳細を取得
app.get(
  '/:facilityId/plans/:planId',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const planId = c.req.param('planId');

    const result = await c.env.DB.prepare(`
      SELECT
        id,
        name,
        short_name,
        duration_minutes,
        price,
        description,
        is_active,
        sort_order,
        is_slot_based,
        max_capacity,
        color_code,
        created_at
      FROM plans
      WHERE id = ? AND facility_id = ?
    `)
      .bind(planId, facilityId)
      .first<Record<string, unknown>>();

    if (!result) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    // スネークケースからキャメルケースに変換
    const plan = {
      id: result.id,
      name: result.name,
      shortName: result.short_name,
      durationMinutes: result.duration_minutes,
      price: result.price,
      description: result.description,
      isActive: result.is_active === 1,
      sortOrder: result.sort_order,
      isSlotBased: result.is_slot_based === 1,
      maxCapacity: result.max_capacity,
      colorCode: result.color_code,
      createdAt: result.created_at,
    };

    return c.json({ plan });
  }
);

// プランを作成
app.post(
  '/:facilityId/plans',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{
      name: string;
      shortName?: string;
      durationMinutes: number;
      description?: string;
      sortOrder?: number;
      isSlotBased?: boolean;
      maxCapacity?: number;
      colorCode?: string;
    }>();

    if (!body.name || !body.durationMinutes) {
      return c.json(
        { error: 'name and durationMinutes are required' },
        400
      );
    }

    if (body.durationMinutes <= 0) {
      return c.json({ error: 'durationMinutes must be positive' }, 400);
    }

    // 枠プランの場合、maxCapacityが必須
    if (body.isSlotBased && (!body.maxCapacity || body.maxCapacity <= 0)) {
      return c.json({ error: 'maxCapacity is required for slot-based plans' }, 400);
    }

    const id = crypto.randomUUID();

    await c.env.DB.prepare(`
      INSERT INTO plans (id, facility_id, name, short_name, duration_minutes, description, sort_order, is_slot_based, max_capacity, color_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        id,
        facilityId,
        body.name,
        body.shortName || null,
        body.durationMinutes,
        body.description || null,
        body.sortOrder || 0,
        body.isSlotBased ? 1 : 0,
        body.maxCapacity || null,
        body.colorCode || null
      )
      .run();

    return c.json({ id }, 201);
  }
);

// プランを更新
app.patch(
  '/:facilityId/plans/:planId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const planId = c.req.param('planId');
    const body = await c.req.json<{
      name?: string;
      shortName?: string | null;
      durationMinutes?: number;
      description?: string;
      isActive?: boolean;
      sortOrder?: number;
      isSlotBased?: boolean;
      maxCapacity?: number;
      colorCode?: string | null;
    }>();

    // プランの存在確認
    const exists = await c.env.DB.prepare(`
      SELECT id FROM plans WHERE id = ? AND facility_id = ?
    `)
      .bind(planId, facilityId)
      .first();

    if (!exists) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.shortName !== undefined) {
      updates.push('short_name = ?');
      values.push(body.shortName);
    }
    if (body.durationMinutes !== undefined) {
      if (body.durationMinutes <= 0) {
        return c.json({ error: 'durationMinutes must be positive' }, 400);
      }
      updates.push('duration_minutes = ?');
      values.push(body.durationMinutes);
    }
    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description);
    }
    if (body.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(body.isActive ? 1 : 0);
    }
    if (body.sortOrder !== undefined) {
      updates.push('sort_order = ?');
      values.push(body.sortOrder);
    }
    if (body.isSlotBased !== undefined) {
      updates.push('is_slot_based = ?');
      values.push(body.isSlotBased ? 1 : 0);
    }
    if (body.maxCapacity !== undefined) {
      updates.push('max_capacity = ?');
      values.push(body.maxCapacity);
    }
    if (body.colorCode !== undefined) {
      updates.push('color_code = ?');
      values.push(body.colorCode);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(planId, facilityId);

    await c.env.DB.prepare(`
      UPDATE plans SET ${updates.join(', ')} WHERE id = ? AND facility_id = ?
    `)
      .bind(...values)
      .run();

    return c.json({ success: true });
  }
);

// プランを無効化
app.post(
  '/:facilityId/plans/:planId/deactivate',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const planId = c.req.param('planId');

    const result = await c.env.DB.prepare(`
      UPDATE plans SET is_active = 0 WHERE id = ? AND facility_id = ?
    `)
      .bind(planId, facilityId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    return c.json({ success: true });
  }
);

// プランを有効化
app.post(
  '/:facilityId/plans/:planId/activate',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const planId = c.req.param('planId');

    const result = await c.env.DB.prepare(`
      UPDATE plans SET is_active = 1 WHERE id = ? AND facility_id = ?
    `)
      .bind(planId, facilityId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    return c.json({ success: true });
  }
);

// プランを完全に削除
app.delete(
  '/:facilityId/plans/:planId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const planId = c.req.param('planId');

    // 使用中のセッションがあるか確認
    const inUse = await c.env.DB.prepare(`
      SELECT id FROM court_sessions
      WHERE plan_id = ? AND status IN ('locking', 'reserved', 'in_use')
    `)
      .bind(planId)
      .first();

    if (inUse) {
      return c.json({ error: 'このプランは現在使用中のため削除できません。無効化してください。' }, 400);
    }

    // 過去のセッションで使用されているか確認
    const hasHistory = await c.env.DB.prepare(`
      SELECT id FROM court_sessions
      WHERE plan_id = ? AND status IN ('completed')
      LIMIT 1
    `)
      .bind(planId)
      .first();

    if (hasHistory) {
      return c.json({ error: 'このプランは過去の予約履歴があるため削除できません。無効化してください。' }, 400);
    }

    // オプションを削除
    await c.env.DB.prepare(`
      DELETE FROM plan_options WHERE plan_id = ?
    `)
      .bind(planId)
      .run();

    // プランを削除
    const result = await c.env.DB.prepare(`
      DELETE FROM plans WHERE id = ? AND facility_id = ?
    `)
      .bind(planId, facilityId)
      .run();

    if (result.meta.changes === 0) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    return c.json({ success: true, deleted: true });
  }
);

// プランを複製
app.post(
  '/:facilityId/plans/:planId/duplicate',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const planId = c.req.param('planId');

    // 元プランを取得
    const originalPlan = await c.env.DB.prepare(`
      SELECT
        name,
        short_name,
        duration_minutes,
        price,
        description,
        sort_order,
        is_slot_based,
        max_capacity,
        color_code
      FROM plans
      WHERE id = ? AND facility_id = ?
    `)
      .bind(planId, facilityId)
      .first<Record<string, unknown>>();

    if (!originalPlan) {
      return c.json({ error: 'Plan not found' }, 404);
    }

    // 新しいプランIDを生成
    const newPlanId = crypto.randomUUID();

    // プランを複製（名前に「のコピー」を追加）
    await c.env.DB.prepare(`
      INSERT INTO plans (id, facility_id, name, short_name, duration_minutes, price, description, sort_order, is_slot_based, max_capacity, color_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        newPlanId,
        facilityId,
        `${originalPlan.name}のコピー`,
        originalPlan.short_name,
        originalPlan.duration_minutes,
        originalPlan.price,
        originalPlan.description,
        originalPlan.sort_order,
        originalPlan.is_slot_based,
        originalPlan.max_capacity,
        originalPlan.color_code
      )
      .run();

    // オプションも複製
    const options = await c.env.DB.prepare(`
      SELECT
        name,
        description,
        price,
        sort_order,
        is_active,
        is_required,
        allow_multiple,
        selection_type,
        option_group
      FROM plan_options
      WHERE plan_id = ?
    `)
      .bind(planId)
      .all();

    if (options.results.length > 0) {
      const optionStatements = options.results.map((opt: Record<string, unknown>) =>
        c.env.DB.prepare(`
          INSERT INTO plan_options (id, plan_id, name, description, price, sort_order, is_active, is_required, allow_multiple, selection_type, option_group)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          crypto.randomUUID(),
          newPlanId,
          opt.name,
          opt.description,
          opt.price,
          opt.sort_order,
          opt.is_active,
          opt.is_required,
          opt.allow_multiple,
          opt.selection_type,
          opt.option_group
        )
      );
      await c.env.DB.batch(optionStatements);
    }

    return c.json({ id: newPlanId }, 201);
  }
);

// プランの並び順を一括更新
app.put(
  '/:facilityId/plans/reorder',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{
      planIds: string[];
    }>();

    if (!body.planIds || !Array.isArray(body.planIds)) {
      return c.json({ error: 'planIds array is required' }, 400);
    }

    // バッチ更新
    const statements = body.planIds.map((planId, index) =>
      c.env.DB.prepare(`
        UPDATE plans SET sort_order = ? WHERE id = ? AND facility_id = ?
      `).bind(index, planId, facilityId)
    );

    await c.env.DB.batch(statements);

    return c.json({ success: true });
  }
);

export default app;
