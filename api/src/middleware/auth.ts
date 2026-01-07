import type { Context, Next } from 'hono';
import type { Env, UserRole } from '../types';
import { createAuth } from '../auth';

// 認証済みユーザー情報を格納する型
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

// Context に追加する変数の型
export interface AuthVariables {
  user: AuthUser;
  facilityId: string;
  userRole: UserRole;
}

/**
 * 認証必須ミドルウェア
 * セッションを検証し、ユーザー情報を c.get('user') で取得可能にする
 */
export const requireAuth = async (
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  next: Next
) => {
  const auth = createAuth(c.env);

  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session || !session.user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    c.set('user', {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    });

    await next();
  } catch (error) {
    console.error('Auth error:', error);
    return c.json({ error: 'Unauthorized' }, 401);
  }
};

/**
 * 施設アクセス権限チェックミドルウェア
 * @param allowedRoles - 許可するロールの配列（省略時は全ロール許可）
 */
export const requireFacilityAccess = (allowedRoles?: UserRole[]) => {
  return async (
    c: Context<{ Bindings: Env; Variables: AuthVariables }>,
    next: Next
  ) => {
    const user = c.get('user');
    const facilityId = c.req.param('facilityId');

    if (!facilityId) {
      return c.json({ error: 'Facility ID is required' }, 400);
    }

    // ユーザーの施設アクセス権限を確認
    const result = await c.env.DB.prepare(
      `SELECT role FROM user_facilities WHERE user_id = ? AND facility_id = ?`
    )
      .bind(user.id, facilityId)
      .first<{ role: UserRole }>();

    if (!result) {
      return c.json({ error: 'Forbidden: No access to this facility' }, 403);
    }

    // ロールチェック
    if (allowedRoles && !allowedRoles.includes(result.role)) {
      return c.json({ error: 'Forbidden: Insufficient permissions' }, 403);
    }

    c.set('facilityId', facilityId);
    c.set('userRole', result.role);

    await next();
  };
};

/**
 * オプショナル認証ミドルウェア
 * 認証されていなくてもリクエストを続行するが、認証されていれば user をセットする
 */
export const optionalAuth = async (
  c: Context<{ Bindings: Env; Variables: Partial<AuthVariables> }>,
  next: Next
) => {
  const auth = createAuth(c.env);

  try {
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (session?.user) {
      c.set('user', {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      });
    }
  } catch {
    // 認証エラーは無視
  }

  await next();
};
