/**
 * 施設管理APIルート
 *
 * 施設の取得・作成・更新を行うエンドポイント
 *
 * @module routes/facilities
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /facilities
 * ユーザーがアクセス可能な施設一覧を取得
 */
app.get('/', requireAuth, async (c) => {
  const user = c.get('user');

  const facilities = await c.env.DB.prepare(`
    SELECT f.id, f.name, f.slug, f.address, uf.role
    FROM facilities f
    JOIN user_facilities uf ON f.id = uf.facility_id
    WHERE uf.user_id = ?
    ORDER BY f.name
  `)
    .bind(user.id)
    .all();

  return c.json({ facilities: facilities.results });
});

// 施設詳細を取得
app.get('/:facilityId', requireAuth, requireFacilityAccess(), async (c) => {
  const facilityId = c.get('facilityId');
  const userRole = c.get('userRole');

  const facility = await c.env.DB.prepare(`
    SELECT id, name, slug, address, business_start_hour, business_end_hour, created_at
    FROM facilities
    WHERE id = ?
  `)
    .bind(facilityId)
    .first();

  if (!facility) {
    return c.json({ error: 'Facility not found' }, 404);
  }

  return c.json({ facility, userRole });
});

// 施設を作成（システム管理者用 - 将来実装）
app.post('/', requireAuth, async (c) => {
  // TODO: システム管理者権限チェック
  const user = c.get('user');
  const body = await c.req.json<{
    name: string;
    slug: string;
    address?: string;
  }>();

  if (!body.name || !body.slug) {
    return c.json({ error: 'name and slug are required' }, 400);
  }

  const id = crypto.randomUUID();

  try {
    // 施設を作成
    await c.env.DB.prepare(`
      INSERT INTO facilities (id, name, slug, address)
      VALUES (?, ?, ?, ?)
    `)
      .bind(id, body.name, body.slug, body.address || null)
      .run();

    // 作成者をadminとして登録
    await c.env.DB.prepare(`
      INSERT INTO user_facilities (id, user_id, facility_id, role)
      VALUES (?, ?, ?, 'admin')
    `)
      .bind(crypto.randomUUID(), user.id, id)
      .run();

    return c.json({ id, name: body.name, slug: body.slug }, 201);
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) {
      return c.json({ error: 'Facility with this slug already exists' }, 409);
    }
    throw error;
  }
});

// 施設を更新
app.patch(
  '/:facilityId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{
      name?: string;
      address?: string;
      businessStartHour?: number;
      businessEndHour?: number;
    }>();

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.name !== undefined) {
      updates.push('name = ?');
      values.push(body.name);
    }
    if (body.address !== undefined) {
      updates.push('address = ?');
      values.push(body.address);
    }
    if (body.businessStartHour !== undefined) {
      updates.push('business_start_hour = ?');
      values.push(body.businessStartHour);
    }
    if (body.businessEndHour !== undefined) {
      updates.push('business_end_hour = ?');
      values.push(body.businessEndHour);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    values.push(facilityId);

    await c.env.DB.prepare(`
      UPDATE facilities SET ${updates.join(', ')} WHERE id = ?
    `)
      .bind(...values)
      .run();

    return c.json({ success: true });
  }
);

export default app;
