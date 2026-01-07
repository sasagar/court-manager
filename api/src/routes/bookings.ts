/**
 * 個別予約管理APIルート
 *
 * 枠プラン（スロットベース）セッションの個別予約管理
 * - 予約一覧取得
 * - 予約追加・更新・削除
 *
 * @module routes/bookings
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireFacilityAccess } from '../middleware/auth';
import { broadcastToFacility } from '../lib/sse';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/**
 * GET /:facilityId/sessions/:sessionId/bookings
 * セッションの個別予約一覧を取得
 */
app.get(
  '/:facilityId/sessions/:sessionId/bookings',
  requireAuth,
  requireFacilityAccess(),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');

    // セッションの存在確認
    const session = await c.env.DB.prepare(`
      SELECT id FROM court_sessions WHERE id = ? AND facility_id = ?
    `)
      .bind(sessionId, facilityId)
      .first();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    const result = await c.env.DB.prepare(`
      SELECT
        id,
        session_id,
        customer_name,
        customer_count,
        customer_phone,
        notes,
        status,
        payment_status,
        created_at,
        updated_at
      FROM session_bookings
      WHERE session_id = ?
      ORDER BY created_at
    `)
      .bind(sessionId)
      .all();

    const bookings = result.results.map((booking: Record<string, unknown>) => ({
      id: booking.id,
      sessionId: booking.session_id,
      customerName: booking.customer_name,
      customerCount: booking.customer_count,
      customerPhone: booking.customer_phone,
      notes: booking.notes,
      status: booking.status,
      paymentStatus: booking.payment_status || 'unpaid',
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    }));

    return c.json({ bookings });
  }
);

// 個別予約を追加
app.post(
  '/:facilityId/sessions/:sessionId/bookings',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const sessionId = c.req.param('sessionId');
    const now = Math.floor(Date.now() / 1000);

    const body = await c.req.json<{
      customerName: string;
      customerCount: number;
      customerPhone?: string;
      notes?: string;
      paymentStatus?: 'paid' | 'unpaid';
    }>();

    if (!body.customerName || !body.customerCount) {
      return c.json({ error: 'customerName and customerCount are required' }, 400);
    }

    if (body.customerCount <= 0) {
      return c.json({ error: 'customerCount must be positive' }, 400);
    }

    // セッションとプラン情報を取得
    const session = await c.env.DB.prepare(`
      SELECT
        cs.id,
        cs.plan_id,
        cs.court_id,
        p.is_slot_based,
        p.max_capacity
      FROM court_sessions cs
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE cs.id = ? AND cs.facility_id = ?
    `)
      .bind(sessionId, facilityId)
      .first<{
        id: number;
        plan_id: string | null;
        court_id: string;
        is_slot_based: number | null;
        max_capacity: number | null;
      }>();

    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }

    // 枠プランでない場合はエラー
    if (!session.is_slot_based) {
      return c.json({ error: 'This session does not support individual bookings' }, 400);
    }

    // 現在の予約人数を取得
    const currentBookings = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(customer_count), 0) as total
      FROM session_bookings
      WHERE session_id = ? AND status = 'confirmed'
    `)
      .bind(sessionId)
      .first<{ total: number }>();

    const currentTotal = currentBookings?.total || 0;
    const maxCapacity = session.max_capacity || 0;

    // 空き枠チェック
    if (currentTotal + body.customerCount > maxCapacity) {
      return c.json(
        {
          error: 'Not enough capacity',
          available: maxCapacity - currentTotal,
          requested: body.customerCount,
        },
        409
      );
    }

    // 予約を追加
    const result = await c.env.DB.prepare(`
      INSERT INTO session_bookings (session_id, customer_name, customer_count, customer_phone, notes, payment_status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `)
      .bind(
        sessionId,
        body.customerName,
        body.customerCount,
        body.customerPhone || null,
        body.notes || null,
        body.paymentStatus || 'unpaid',
        now,
        now
      )
      .first<{ id: number }>();

    // セッションの合計人数と顧客名を更新
    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET customer_count = (
        SELECT COALESCE(SUM(customer_count), 0)
        FROM session_bookings
        WHERE session_id = ? AND status = 'confirmed'
      ),
      customer_name = (
        SELECT GROUP_CONCAT(customer_name, ', ')
        FROM session_bookings
        WHERE session_id = ? AND status = 'confirmed'
      ),
      updated_at = ?
      WHERE id = ?
    `)
      .bind(sessionId, sessionId, now, sessionId)
      .run();

    // 更新後の顧客名を取得
    const updatedNames = await c.env.DB.prepare(`
      SELECT GROUP_CONCAT(customer_name, ', ') as names
      FROM session_bookings
      WHERE session_id = ? AND status = 'confirmed'
    `)
      .bind(sessionId)
      .first<{ names: string | null }>();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'BOOKING_ADDED',
      sessionId: Number(sessionId),
      courtId: session.court_id,
      booking: {
        id: result?.id,
        customerName: body.customerName,
        customerCount: body.customerCount,
        paymentStatus: 'unpaid' as const,
      },
      totalCount: currentTotal + body.customerCount,
      newTotalCount: currentTotal + body.customerCount,
      customerName: updatedNames?.names || body.customerName,
      maxCapacity,
    });

    return c.json({
      id: result?.id,
      totalCount: currentTotal + body.customerCount,
      available: maxCapacity - currentTotal - body.customerCount,
    }, 201);
  }
);

// 個別予約を削除（キャンセル）
app.delete(
  '/:facilityId/bookings/:bookingId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const bookingId = c.req.param('bookingId');
    const now = Math.floor(Date.now() / 1000);

    // 予約とセッション情報を取得
    const booking = await c.env.DB.prepare(`
      SELECT
        sb.id,
        sb.session_id,
        sb.customer_count,
        cs.court_id,
        cs.facility_id,
        p.max_capacity
      FROM session_bookings sb
      JOIN court_sessions cs ON sb.session_id = cs.id
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE sb.id = ? AND cs.facility_id = ?
    `)
      .bind(bookingId, facilityId)
      .first<{
        id: number;
        session_id: number;
        customer_count: number;
        court_id: string;
        facility_id: string;
        max_capacity: number | null;
      }>();

    if (!booking) {
      return c.json({ error: 'Booking not found' }, 404);
    }

    // 予約を削除
    await c.env.DB.prepare(`
      DELETE FROM session_bookings WHERE id = ?
    `)
      .bind(bookingId)
      .run();

    // セッションの合計人数と顧客名を更新
    const newTotal = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(customer_count), 0) as total
      FROM session_bookings
      WHERE session_id = ? AND status = 'confirmed'
    `)
      .bind(booking.session_id)
      .first<{ total: number }>();

    const newNames = await c.env.DB.prepare(`
      SELECT GROUP_CONCAT(customer_name, ', ') as names
      FROM session_bookings
      WHERE session_id = ? AND status = 'confirmed'
    `)
      .bind(booking.session_id)
      .first<{ names: string | null }>();

    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET customer_count = ?,
      customer_name = ?,
      updated_at = ?
      WHERE id = ?
    `)
      .bind(newTotal?.total || 0, newNames?.names || null, now, booking.session_id)
      .run();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'BOOKING_REMOVED',
      sessionId: booking.session_id,
      courtId: booking.court_id,
      bookingId: Number(bookingId),
      totalCount: newTotal?.total || 0,
      maxCapacity: booking.max_capacity,
      customerName: newNames?.names || '',
    });

    return c.json({
      success: true,
      totalCount: newTotal?.total || 0,
      available: (booking.max_capacity || 0) - (newTotal?.total || 0),
    });
  }
);

// 個別予約を更新
app.patch(
  '/:facilityId/bookings/:bookingId',
  requireAuth,
  requireFacilityAccess(['admin', 'staff']),
  async (c) => {
    const facilityId = c.get('facilityId');
    const bookingId = c.req.param('bookingId');
    const now = Math.floor(Date.now() / 1000);

    const body = await c.req.json<{
      customerName?: string;
      customerCount?: number;
      customerPhone?: string;
      notes?: string;
      status?: 'confirmed' | 'cancelled';
      paymentStatus?: 'paid' | 'unpaid';
    }>();

    // 予約とセッション情報を取得
    const booking = await c.env.DB.prepare(`
      SELECT
        sb.id,
        sb.session_id,
        sb.customer_count as current_count,
        cs.court_id,
        cs.facility_id,
        p.max_capacity
      FROM session_bookings sb
      JOIN court_sessions cs ON sb.session_id = cs.id
      LEFT JOIN plans p ON cs.plan_id = p.id
      WHERE sb.id = ? AND cs.facility_id = ?
    `)
      .bind(bookingId, facilityId)
      .first<{
        id: number;
        session_id: number;
        current_count: number;
        court_id: string;
        facility_id: string;
        max_capacity: number | null;
      }>();

    if (!booking) {
      return c.json({ error: 'Booking not found' }, 404);
    }

    // 人数変更の場合、空き枠チェック
    if (body.customerCount !== undefined && body.customerCount !== booking.current_count) {
      const currentBookings = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(customer_count), 0) as total
        FROM session_bookings
        WHERE session_id = ? AND status = 'confirmed' AND id != ?
      `)
        .bind(booking.session_id, bookingId)
        .first<{ total: number }>();

      const otherTotal = currentBookings?.total || 0;
      const maxCapacity = booking.max_capacity || 0;

      if (otherTotal + body.customerCount > maxCapacity) {
        return c.json(
          {
            error: 'Not enough capacity',
            available: maxCapacity - otherTotal,
            requested: body.customerCount,
          },
          409
        );
      }
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.customerName !== undefined) {
      updates.push('customer_name = ?');
      values.push(body.customerName);
    }
    if (body.customerCount !== undefined) {
      updates.push('customer_count = ?');
      values.push(body.customerCount);
    }
    if (body.customerPhone !== undefined) {
      updates.push('customer_phone = ?');
      values.push(body.customerPhone);
    }
    if (body.notes !== undefined) {
      updates.push('notes = ?');
      values.push(body.notes);
    }
    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);
    }
    if (body.paymentStatus !== undefined) {
      updates.push('payment_status = ?');
      values.push(body.paymentStatus);
    }

    if (updates.length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(bookingId);

    await c.env.DB.prepare(`
      UPDATE session_bookings SET ${updates.join(', ')} WHERE id = ?
    `)
      .bind(...values)
      .run();

    // セッションの合計人数と顧客名を更新
    const newTotal = await c.env.DB.prepare(`
      SELECT COALESCE(SUM(customer_count), 0) as total
      FROM session_bookings
      WHERE session_id = ? AND status = 'confirmed'
    `)
      .bind(booking.session_id)
      .first<{ total: number }>();

    const newNames = await c.env.DB.prepare(`
      SELECT GROUP_CONCAT(customer_name, ', ') as names
      FROM session_bookings
      WHERE session_id = ? AND status = 'confirmed'
    `)
      .bind(booking.session_id)
      .first<{ names: string | null }>();

    await c.env.DB.prepare(`
      UPDATE court_sessions
      SET customer_count = ?,
      customer_name = ?,
      updated_at = ?
      WHERE id = ?
    `)
      .bind(newTotal?.total || 0, newNames?.names || null, now, booking.session_id)
      .run();

    // 更新後の予約情報を取得
    const updatedBooking = await c.env.DB.prepare(`
      SELECT id, customer_name, customer_count, payment_status
      FROM session_bookings WHERE id = ?
    `)
      .bind(bookingId)
      .first<{ id: number; customer_name: string; customer_count: number; payment_status: string }>();

    // SSEブロードキャスト
    broadcastToFacility(facilityId, {
      type: 'BOOKING_UPDATED',
      sessionId: booking.session_id,
      courtId: booking.court_id,
      bookingId: Number(bookingId),
      booking: updatedBooking ? {
        id: updatedBooking.id,
        customerName: updatedBooking.customer_name,
        customerCount: updatedBooking.customer_count,
        paymentStatus: (updatedBooking.payment_status || 'unpaid') as 'paid' | 'unpaid',
      } : undefined,
      newCount: newTotal?.total || 0,
      maxCapacity: booking.max_capacity,
      customerName: newNames?.names || '',
    });

    return c.json({
      success: true,
      totalCount: newTotal?.total || 0,
      available: (booking.max_capacity || 0) - (newTotal?.total || 0),
    });
  }
);

export default app;
