/**
 * ユーザー管理APIルート
 *
 * ユーザーアカウントおよび施設アクセス権の管理
 * - 現在のユーザー情報取得・更新
 * - 施設ユーザー一覧（管理者専用）
 * - ユーザー招待・ロール変更・削除
 *
 * @module routes/users
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /me
 * 現在のユーザー情報を取得
 */
app.get('/me', requireAuth, async (c) => {
  const authUser = c.get('user');

  // ユーザー情報をDBから取得（imageを含む）
  const user = await c.env.DB.prepare(`
    SELECT id, name, email, image FROM user WHERE id = ?
  `)
    .bind(authUser.id)
    .first<{ id: string; name: string; email: string; image: string | null }>();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // スタッフ情報も取得（紐付いている場合）
  const staff = await c.env.DB.prepare(`
    SELECT
      st.id,
      st.display_name,
      st.employee_id,
      st.color_code,
      st.phone
    FROM staff st
    WHERE st.user_id = ?
  `)
    .bind(user.id)
    .first();

  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    },
    staff: staff
      ? {
          id: staff.id,
          displayName: staff.display_name,
          employeeId: staff.employee_id,
          colorCode: staff.color_code,
          phone: staff.phone,
        }
      : null,
  });
});

// 現在のユーザー情報を更新
app.patch('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    name?: string;
    image?: string;
  }>();

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    values.push(body.name);
  }
  if (body.image !== undefined) {
    updates.push('image = ?');
    values.push(body.image);
  }

  if (updates.length > 0) {
    updates.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));
    values.push(user.id);

    await c.env.DB.prepare(`UPDATE user SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  return c.json({ success: true });
});

// 施設のユーザー一覧を取得（admin only）
app.get(
  '/:facilityId/users',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');

    const result = await c.env.DB.prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.image,
        u.created_at,
        uf.role,
        st.id AS staff_id,
        st.display_name AS staff_display_name
      FROM user u
      JOIN user_facilities uf ON u.id = uf.user_id
      LEFT JOIN staff st ON u.id = st.user_id
      WHERE uf.facility_id = ?
      ORDER BY u.name
    `)
      .bind(facilityId)
      .all();

    const users = result.results.map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      createdAt: row.created_at,
      role: row.role,
      staffId: row.staff_id,
      staffDisplayName: row.staff_display_name,
    }));

    return c.json({ users });
  }
);

// ユーザーを施設に招待（新規作成 or 既存ユーザーを追加）
app.post(
  '/:facilityId/users',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const body = await c.req.json<{
      email: string;
      name: string;
      password: string;
      role?: 'admin' | 'staff' | 'viewer';
    }>();

    if (!body.email || !body.name || !body.password) {
      return c.json({ error: 'email, name, and password are required' }, 400);
    }

    // メールアドレスの重複チェック
    const existingUser = await c.env.DB.prepare(`
      SELECT id FROM user WHERE email = ?
    `)
      .bind(body.email)
      .first<{ id: string }>();

    let userId: string;

    if (existingUser) {
      // 既存ユーザーが既にこの施設に所属しているかチェック
      const existingAccess = await c.env.DB.prepare(`
        SELECT id FROM user_facilities WHERE user_id = ? AND facility_id = ?
      `)
        .bind(existingUser.id, facilityId)
        .first();

      if (existingAccess) {
        return c.json({ error: 'このユーザーは既に施設に登録されています' }, 400);
      }

      userId = existingUser.id;
    } else {
      // 新規ユーザー作成
      userId = crypto.randomUUID();

      // パスワードをハッシュ化（Better Authと同じ方式）
      const encoder = new TextEncoder();
      const data = encoder.encode(body.password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // ユーザーを作成
      await c.env.DB.prepare(`
        INSERT INTO user (id, name, email, email_verified)
        VALUES (?, ?, ?, 0)
      `)
        .bind(userId, body.name, body.email)
        .run();

      // アカウント（認証情報）を作成
      const accountId = crypto.randomUUID();
      await c.env.DB.prepare(`
        INSERT INTO account (id, user_id, account_id, provider_id, password)
        VALUES (?, ?, ?, 'credential', ?)
      `)
        .bind(accountId, userId, body.email, hashedPassword)
        .run();
    }

    // 施設へのアクセス権を付与
    await c.env.DB.prepare(`
      INSERT INTO user_facilities (id, user_id, facility_id, role)
      VALUES (?, ?, ?, ?)
    `)
      .bind(crypto.randomUUID(), userId, facilityId, body.role || 'viewer')
      .run();

    return c.json({ id: userId }, 201);
  }
);

// ユーザーの施設ロールを更新
app.patch(
  '/:facilityId/users/:userId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const userId = c.req.param('userId');
    const currentUser = c.get('user');
    const body = await c.req.json<{
      role?: 'admin' | 'staff' | 'viewer';
      staffId?: string | null;
    }>();

    // 自分自身のロールを変更しようとしている場合は拒否
    if (userId === currentUser.id && body.role !== undefined) {
      return c.json({ error: '自分自身のロールは変更できません' }, 400);
    }

    // ユーザーの施設アクセスが存在するか確認
    const userFacility = await c.env.DB.prepare(`
      SELECT id FROM user_facilities WHERE user_id = ? AND facility_id = ?
    `)
      .bind(userId, facilityId)
      .first();

    if (!userFacility) {
      return c.json({ error: 'User not found in this facility' }, 404);
    }

    // ロールを更新
    if (body.role !== undefined) {
      await c.env.DB.prepare(`
        UPDATE user_facilities SET role = ? WHERE user_id = ? AND facility_id = ?
      `)
        .bind(body.role, userId, facilityId)
        .run();
    }

    // スタッフとの紐付けを更新
    if (body.staffId !== undefined) {
      // まず既存の紐付けを解除
      await c.env.DB.prepare(`
        UPDATE staff SET user_id = NULL WHERE user_id = ?
      `)
        .bind(userId)
        .run();

      // 新しい紐付けを設定
      if (body.staffId) {
        await c.env.DB.prepare(`
          UPDATE staff SET user_id = ? WHERE id = ?
        `)
          .bind(userId, body.staffId)
          .run();
      }
    }

    return c.json({ success: true });
  }
);

// ユーザーを施設から削除
app.delete(
  '/:facilityId/users/:userId',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const userId = c.req.param('userId');
    const currentUser = c.get('user');

    // 自分自身を削除しようとしている場合は拒否
    if (userId === currentUser.id) {
      return c.json({ error: '自分自身を削除することはできません' }, 400);
    }

    // この施設の最後のadminかどうかチェック
    const userRole = await c.env.DB.prepare(`
      SELECT role FROM user_facilities WHERE user_id = ? AND facility_id = ?
    `)
      .bind(userId, facilityId)
      .first<{ role: string }>();

    if (userRole?.role === 'admin') {
      const adminCount = await c.env.DB.prepare(`
        SELECT COUNT(*) AS count FROM user_facilities WHERE facility_id = ? AND role = 'admin'
      `)
        .bind(facilityId)
        .first<{ count: number }>();

      if (adminCount && adminCount.count <= 1) {
        return c.json({ error: '施設には少なくとも1人の管理者が必要です' }, 400);
      }
    }

    // スタッフとの紐付けを解除
    await c.env.DB.prepare(`
      UPDATE staff SET user_id = NULL WHERE user_id = ?
    `)
      .bind(userId)
      .run();

    // 施設からのアクセス権を削除
    await c.env.DB.prepare(`
      DELETE FROM user_facilities WHERE user_id = ? AND facility_id = ?
    `)
      .bind(userId, facilityId)
      .run();

    return c.json({ success: true });
  }
);

export default app;
