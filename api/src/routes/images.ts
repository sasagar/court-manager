/**
 * 画像管理APIルート
 *
 * Cloudflare R2を使用した画像のアップロード・取得・削除
 * - スタッフ画像等のアップロード（管理者専用）
 * - 画像取得（公開エンドポイント）
 * - 画像削除
 *
 * @module routes/images
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** 許可されるMIMEタイプ */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** 最大ファイルサイズ (5MB) */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * POST /:facilityId/images/upload
 * 画像をアップロード
 */
app.post(
  '/:facilityId/images/upload',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');

    try {
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;
      const type = formData.get('type') as string | null; // 'staff' | 'user' など

      if (!file) {
        return c.json({ error: 'No file provided' }, 400);
      }

      // MIMEタイプのチェック
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return c.json(
          { error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` },
          400
        );
      }

      // ファイルサイズのチェック
      if (file.size > MAX_FILE_SIZE) {
        return c.json(
          { error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
          400
        );
      }

      // ファイル名を生成 (施設ID/タイプ/UUID.拡張子)
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${facilityId}/${type || 'general'}/${crypto.randomUUID()}.${ext}`;

      // R2にアップロード
      const arrayBuffer = await file.arrayBuffer();
      await c.env.IMAGES.put(fileName, arrayBuffer, {
        httpMetadata: {
          contentType: file.type,
        },
      });

      // 公開URLを生成
      // Cloudflare R2の公開URLパターン
      const publicUrl = `https://court-management-api.sasagar-2ef.workers.dev/api/images/${fileName}`;

      return c.json({ url: publicUrl, key: fileName }, 201);
    } catch (err) {
      console.error('Image upload error:', err);
      return c.json({ error: 'Failed to upload image' }, 500);
    }
  }
);

// 画像を取得（公開エンドポイント）
app.get('/images/*', async (c) => {
  const path = c.req.path.replace('/api/images/', '');

  try {
    const object = await c.env.IMAGES.get(path);

    if (!object) {
      return c.json({ error: 'Image not found' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000'); // 1年キャッシュ

    return new Response(object.body, {
      headers,
    });
  } catch (err) {
    console.error('Image fetch error:', err);
    return c.json({ error: 'Failed to fetch image' }, 500);
  }
});

// 画像を削除
app.delete(
  '/:facilityId/images',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const body = await c.req.json<{ key: string }>();

    if (!body.key) {
      return c.json({ error: 'Image key is required' }, 400);
    }

    try {
      await c.env.IMAGES.delete(body.key);
      return c.json({ success: true });
    } catch (err) {
      console.error('Image delete error:', err);
      return c.json({ error: 'Failed to delete image' }, 500);
    }
  }
);

export default app;
