import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import type { Env } from './types';
import * as schema from './db/schema';

export function createAuth(env: Env) {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://court-management-frontend.sasagar-2ef.workers.dev',
    ],
    advanced: {
      crossSubDomainCookies: {
        enabled: false,
      },
      defaultCookieAttributes: {
        sameSite: 'none',
        secure: true,
        path: '/',
        partitioned: true,
      },
      disableCSRFCheck: true, // 一時的にCSRFチェックを無効化（診断用）
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
