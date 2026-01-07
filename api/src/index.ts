import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { createAuth } from './auth';
import type { AuthVariables } from './middleware/auth';

// Routes
import facilitiesRoutes from './routes/facilities';
import courtsRoutes from './routes/courts';
import sessionsRoutes from './routes/sessions';
import shiftsRoutes from './routes/shifts';
import staffRoutes from './routes/staff';
import assignmentsRoutes from './routes/assignments';
import eventsRoutes from './routes/events';
import plansRoutes from './routes/plans';
import planOptionsRoutes from './routes/plan-options';
import optionGroupsRoutes from './routes/option-groups';
import bookingsRoutes from './routes/bookings';
import courtBlocksRoutes from './routes/court-blocks';
import breaksRoutes from './routes/breaks';
import usersRoutes from './routes/users';
import setupRoutes from './routes/setup';
import imagesRoutes from './routes/images';
import publicViewRoutes from './routes/public-view';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// CORS設定
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://court-management-frontend.sasagar-2ef.workers.dev',
    ],
    credentials: true,
  })
);

// Better Auth ハンドラー
app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// ヘルスチェック
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// API Routes
app.route('/api/facilities', facilitiesRoutes);
app.route('/api/facilities', courtsRoutes);
app.route('/api/facilities', sessionsRoutes);
app.route('/api/facilities', shiftsRoutes);
app.route('/api/facilities', staffRoutes);
app.route('/api/facilities', assignmentsRoutes);
app.route('/api/facilities', eventsRoutes);
app.route('/api/facilities', plansRoutes);
app.route('/api/facilities', planOptionsRoutes);
app.route('/api/facilities', optionGroupsRoutes);
app.route('/api/facilities', bookingsRoutes);
app.route('/api/facilities', courtBlocksRoutes);
app.route('/api/facilities', breaksRoutes);
app.route('/api/users', usersRoutes);
app.route('/api/facilities', usersRoutes);
app.route('/api/setup', setupRoutes);
app.route('/api/facilities', imagesRoutes);
app.route('/api', imagesRoutes); // 画像取得用の公開エンドポイント
app.route('/api', publicViewRoutes); // 公開ビュー用エンドポイント

export default app;
