/**
 * 公開ビューAPIルート
 *
 * QRコード等で共有可能な認証不要の読み取り専用ビュー
 * - トークンの生成・取得・無効化（管理者専用）
 * - 公開ビューデータ取得（認証不要）
 * - 公開ビュー用SSEストリーム
 *
 * @module routes/public-view
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * POST /facilities/:facilityId/public-view/generate-token
 * トークン生成（認証必要・管理者のみ）
 */
app.post(
  '/facilities/:facilityId/public-view/generate-token',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');

    // 新しいトークンを生成
    const token = crypto.randomUUID().replace(/-/g, '');

    await c.env.DB.prepare(
      'UPDATE facilities SET public_view_token = ? WHERE id = ?'
    )
      .bind(token, facilityId)
      .run();

    return c.json({ token });
  }
);

// 現在のトークン取得（認証必要・管理者のみ）
app.get(
  '/facilities/:facilityId/public-view/token',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');

    const facility = await c.env.DB.prepare(
      'SELECT public_view_token FROM facilities WHERE id = ?'
    )
      .bind(facilityId)
      .first<{ public_view_token: string | null }>();

    return c.json({ token: facility?.public_view_token || null });
  }
);

// トークン無効化（認証必要・管理者のみ）
app.delete(
  '/facilities/:facilityId/public-view/token',
  requireAuth,
  requireFacilityAccess(['admin']),
  async (c) => {
    const facilityId = c.get('facilityId');

    await c.env.DB.prepare(
      'UPDATE facilities SET public_view_token = NULL WHERE id = ?'
    )
      .bind(facilityId)
      .run();

    return c.json({ success: true });
  }
);

// 公開ビューデータ取得（認証不要・トークンで認証）
app.get('/public-view/:token', async (c) => {
  try {
    const token = c.req.param('token');

    // トークンで施設を検索
    const facility = await c.env.DB.prepare(
      'SELECT id, name, business_start_hour, business_end_hour FROM facilities WHERE public_view_token = ?'
    )
      .bind(token)
      .first<{
        id: string;
        name: string;
        business_start_hour: number | null;
        business_end_hour: number | null;
      }>();

    if (!facility) {
      return c.json({ error: 'Invalid or expired token' }, 404);
    }

    // 日付パラメータを取得（なければ今日の日付）
    const dateParam = c.req.query('date');
    let targetDate: string;

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      // 日付パラメータが有効な形式の場合
      targetDate = dateParam;
    } else {
      // 今日の日付（JST）
      const now = new Date();
      const jstOffset = 9 * 60 * 60 * 1000;
      const jstDate = new Date(now.getTime() + jstOffset);
      targetDate = jstDate.toISOString().split('T')[0];
    }

  // コート一覧（有効なコートのみ）
  const courtsResult = await c.env.DB.prepare(
    'SELECT id, name, sort_order FROM courts WHERE facility_id = ? AND is_active = 1 ORDER BY sort_order, name'
  )
    .bind(facility.id)
    .all<{ id: string; name: string; sort_order: number }>();

  // 指定日のセッション
  const sessionsResult = await c.env.DB.prepare(`
    SELECT
      cs.id,
      cs.court_id,
      cs.status,
      cs.start_time,
      cs.estimated_end_time,
      cs.customer_name,
      cs.customer_count,
      cs.plan_id,
      p.name AS plan_name,
      p.short_name AS plan_short_name,
      p.color_code AS plan_color
    FROM court_sessions cs
    LEFT JOIN plans p ON cs.plan_id = p.id
    WHERE cs.facility_id = ?
      AND DATE(datetime(cs.start_time, 'unixepoch', '+9 hours')) = ?
    ORDER BY cs.start_time
  `)
    .bind(facility.id, targetDate)
    .all<{
      id: string;
      court_id: string;
      status: string;
      start_time: number;
      estimated_end_time: number | null;
      customer_name: string | null;
      customer_count: number | null;
      plan_id: string | null;
      plan_name: string | null;
      plan_short_name: string | null;
      plan_color: string | null;
    }>();

  // 指定日のシフト
  const shiftsResult = await c.env.DB.prepare(`
    SELECT
      sh.id,
      sh.staff_id,
      sh.start_time,
      sh.end_time,
      sh.status,
      st.display_name AS staff_name,
      st.color_code AS staff_color,
      st.image_url AS staff_image_url
    FROM shifts sh
    JOIN staff st ON sh.staff_id = st.id
    LEFT JOIN staff_facilities sf ON st.id = sf.staff_id AND sf.facility_id = sh.facility_id
    WHERE sh.facility_id = ?
      AND sh.date = ?
      AND st.is_active = 1
    ORDER BY sh.start_time, st.display_name
  `)
    .bind(facility.id, targetDate)
    .all<{
      id: string;
      staff_id: string;
      start_time: number;
      end_time: number;
      status: string;
      staff_name: string;
      staff_color: string | null;
      staff_image_url: string | null;
    }>();

  // 指定日の休憩
  const breaksResult = await c.env.DB.prepare(`
    SELECT
      sb.id,
      sh.staff_id,
      sb.start_time,
      sb.end_time,
      st.display_name AS staff_name,
      st.color_code AS staff_color
    FROM scheduled_breaks sb
    JOIN shifts sh ON sb.shift_id = sh.id
    JOIN staff st ON sh.staff_id = st.id
    WHERE sb.facility_id = ?
      AND DATE(datetime(sb.start_time, 'unixepoch', '+9 hours')) = ?
      AND st.is_active = 1
    ORDER BY sb.start_time
  `)
    .bind(facility.id, targetDate)
    .all<{
      id: string;
      staff_id: string;
      start_time: number;
      end_time: number;
      staff_name: string;
      staff_color: string | null;
    }>();

  // 指定日のブロック
  // 日付ベースのブロックと曜日ベースのブロック両方を取得
  // 日付文字列をJSTとして解釈して曜日を取得
  const dayOfWeek = new Date(targetDate + 'T00:00:00+09:00').getDay();
  const blocksResult = await c.env.DB.prepare(`
    SELECT
      cb.id,
      cb.court_id,
      cb.start_time,
      cb.end_time,
      cb.reason,
      cb.block_type,
      c.name AS court_name
    FROM court_blocks cb
    LEFT JOIN courts c ON cb.court_id = c.id
    WHERE cb.facility_id = ?
      AND cb.is_active = 1
      AND (
        cb.date = ?
        OR (cb.date IS NULL AND cb.day_of_week = ?)
      )
    ORDER BY cb.start_time
  `)
    .bind(facility.id, targetDate, dayOfWeek)
    .all<{
      id: string;
      court_id: string | null;
      start_time: number;
      end_time: number;
      reason: string | null;
      block_type: string;
      court_name: string | null;
    }>();

  return c.json({
    facility: {
      id: facility.id,
      name: facility.name,
      businessHoursStart: facility.business_start_hour,
      businessHoursEnd: facility.business_end_hour,
    },
    date: targetDate,
    courts: courtsResult.results.map((court) => ({
      id: court.id,
      name: court.name,
      sortOrder: court.sort_order,
    })),
    sessions: sessionsResult.results.map((session) => ({
      id: session.id,
      courtId: session.court_id,
      status: session.status,
      startTime: session.start_time,
      endTime: session.estimated_end_time,
      customerName: session.customer_name,
      partySize: session.customer_count,
      planId: session.plan_id,
      planName: session.plan_name,
      planShortName: session.plan_short_name,
      planColor: session.plan_color,
    })),
    shifts: shiftsResult.results.map((shift) => ({
      id: shift.id,
      staffId: shift.staff_id,
      staffName: shift.staff_name,
      staffColor: shift.staff_color,
      staffImageUrl: shift.staff_image_url,
      startTime: shift.start_time,
      endTime: shift.end_time,
      status: shift.status,
    })),
    breaks: breaksResult.results.map((b) => ({
      id: b.id,
      staffId: b.staff_id,
      staffName: b.staff_name,
      staffColor: b.staff_color,
      startTime: b.start_time,
      endTime: b.end_time,
    })),
    blocks: blocksResult.results.map((block) => ({
      id: block.id,
      courtId: block.court_id,
      courtName: block.court_name,
      startTime: block.start_time,
      endTime: block.end_time,
      reason: block.reason,
      blockType: block.block_type,
    })),
  });
  } catch (error) {
    console.error('Public view error:', error);
    return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

// SSE for public view (認証不要)
app.get('/public-view/:token/events', async (c) => {
  const token = c.req.param('token');

  // トークンで施設を検索
  const facility = await c.env.DB.prepare(
    'SELECT id FROM facilities WHERE public_view_token = ?'
  )
    .bind(token)
    .first<{ id: string }>();

  if (!facility) {
    return c.json({ error: 'Invalid or expired token' }, 404);
  }

  // SSEストリームを返す
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // 初期イベント
  const sendEvent = async (data: unknown) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(message));
  };

  // ハートビート
  const heartbeatInterval = setInterval(async () => {
    try {
      await sendEvent({ type: 'heartbeat', timestamp: new Date().toISOString() });
    } catch {
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  // 初期接続メッセージ
  sendEvent({ type: 'connected', facilityId: facility.id });

  // クリーンアップ
  c.req.raw.signal.addEventListener('abort', () => {
    clearInterval(heartbeatInterval);
    writer.close();
  });

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});

export default app;
