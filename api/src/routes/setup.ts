/**
 * 初期セットアップAPIルート
 *
 * システム初回セットアップ用エンドポイント
 * - セットアップ状態の確認
 * - 初期施設・デモデータの作成
 *
 * @module routes/setup
 */

import { Hono } from 'hono';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /status
 * 初期セットアップ状態を確認
 */
app.get('/status', async (c) => {
  // ユーザーが存在するか確認
  const userCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM user
  `).first<{ count: number }>();

  // 施設が存在するか確認
  const facilityCount = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM facilities
  `).first<{ count: number }>();

  return c.json({
    hasUsers: (userCount?.count ?? 0) > 0,
    hasFacilities: (facilityCount?.count ?? 0) > 0,
    isSetupComplete: (userCount?.count ?? 0) > 0 && (facilityCount?.count ?? 0) > 0,
  });
});

// 初期施設とデモデータをセットアップ（最初のユーザーが登録後に呼ぶ）
app.post('/initialize', async (c) => {
  const body = await c.req.json<{
    userId: string;
    facilityName: string;
    facilitySlug?: string;
  }>();

  if (!body.userId || !body.facilityName) {
    return c.json({ error: 'userId and facilityName are required' }, 400);
  }

  // ユーザーが存在するか確認
  const user = await c.env.DB.prepare(`
    SELECT id, name, email FROM user WHERE id = ?
  `).bind(body.userId).first();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // 既に施設が存在する場合はエラー
  const existingFacility = await c.env.DB.prepare(`
    SELECT id FROM facilities LIMIT 1
  `).first();

  if (existingFacility) {
    return c.json({ error: 'Facility already exists. Setup is complete.' }, 400);
  }

  const facilityId = crypto.randomUUID();
  const slug = body.facilitySlug || body.facilityName.toLowerCase().replace(/\s+/g, '-');

  try {
    // 施設を作成
    await c.env.DB.prepare(`
      INSERT INTO facilities (id, name, slug)
      VALUES (?, ?, ?)
    `).bind(facilityId, body.facilityName, slug).run();

    // ユーザーをadminとして登録
    await c.env.DB.prepare(`
      INSERT INTO user_facilities (id, user_id, facility_id, role)
      VALUES (?, ?, ?, 'admin')
    `).bind(crypto.randomUUID(), body.userId, facilityId).run();

    // スタッフレコードを作成
    const staffId = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO staff (id, display_name, user_id, is_active)
      VALUES (?, ?, ?, 1)
    `).bind(staffId, user.name, body.userId).run();

    // スタッフを施設に関連付け
    await c.env.DB.prepare(`
      INSERT INTO staff_facilities (id, staff_id, facility_id, role)
      VALUES (?, ?, ?, 'admin')
    `).bind(crypto.randomUUID(), staffId, facilityId).run();

    // デフォルトコートを作成
    const courtNames = ['コートA', 'コートB', 'コートC'];
    for (let i = 0; i < courtNames.length; i++) {
      await c.env.DB.prepare(`
        INSERT INTO courts (id, facility_id, name, sort_order)
        VALUES (?, ?, ?, ?)
      `).bind(crypto.randomUUID(), facilityId, courtNames[i], i).run();
    }

    // デフォルトプランを作成
    const defaultPlans = [
      { name: '30分プラン', duration: 30, price: 1500 },
      { name: '1時間プラン', duration: 60, price: 2500 },
      { name: '2時間プラン', duration: 120, price: 4000 },
    ];
    for (let i = 0; i < defaultPlans.length; i++) {
      const plan = defaultPlans[i];
      await c.env.DB.prepare(`
        INSERT INTO plans (id, facility_id, name, duration_minutes, price, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), facilityId, plan.name, plan.duration, plan.price, i).run();
    }

    return c.json({
      success: true,
      facilityId,
      message: 'Setup complete! You can now access the dashboard.',
    }, 201);
  } catch (error) {
    console.error('Setup error:', error);
    return c.json({ error: 'Setup failed: ' + String(error) }, 500);
  }
});

export default app;
