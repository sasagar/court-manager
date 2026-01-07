# Court Manager

[日本語版 README はこちら](README.ja.md)

A real-time court reservation and staff management system for indoor sports facilities (HADO ARENA, etc.).

## Live Demo

- **Frontend**: <https://court-management-frontend.sasagar-2ef.workers.dev>
- **API**: <https://court-management-api.sasagar-2ef.workers.dev>

## Features

- **Court Management**: Real-time court status monitoring and reservation management
- **Staff Shift Management**: Staff scheduling, assignment, and handover tracking
- **Real-time Updates**: Server-Sent Events (SSE) for instant status synchronization
- **Public View**: QR-shareable read-only view for customers
- **Court Blocks**: Manage unavailable time slots by date or day of week
- **Multi-facility Support**: Manage multiple facilities from a single system

## Tech Stack

| Component      | Technology                                                 |
| -------------- | ---------------------------------------------------------- |
| Frontend       | [Waku](https://waku.gg/) (React RSC) on Cloudflare Workers |
| Backend        | [Hono](https://hono.dev/) on Cloudflare Workers            |
| Database       | Cloudflare D1 (SQLite)                                     |
| Authentication | [Better Auth](https://www.better-auth.com/)                |
| Real-time      | Server-Sent Events (SSE)                                   |

## Project Structure

```
court-manager/
├── api/                    # Cloudflare Workers API (Hono)
│   ├── src/
│   │   ├── index.ts        # Main entry point
│   │   ├── auth.ts         # Better Auth config
│   │   ├── routes/         # API route handlers
│   │   ├── middleware/     # Auth & facility access control
│   │   └── lib/sse.ts      # SSE management
│   └── migrations/         # D1 SQL migrations
│
└── waku/                   # Frontend (Waku/React)
    └── src/
        ├── pages/          # Route pages
        ├── components/     # React components
        ├── hooks/          # Custom hooks (SSE, API)
        └── lib/            # API client, auth client
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account

### API Setup

```bash
cd api
npm install

# Copy wrangler config template
cp wrangler.toml.example wrangler.toml

# Create D1 database
wrangler d1 create court-management-db
# Update database_id in wrangler.toml with the ID from the output

# Create R2 bucket for images
wrangler r2 bucket create court-management-images

# Run migrations (local)
wrangler d1 execute court-management-db --file=migrations/0001_initial.sql --local

# Start development server
wrangler dev
```

### Frontend Setup

```bash
cd waku
npm install

# Copy wrangler config template
cp wrangler.toml.example wrangler.toml

# Start development server
npm run dev
```

### Deployment

```bash
# Deploy API
cd api
npm run deploy

# Deploy Frontend
cd waku
npm run build
wrangler deploy
```

## Environment Variables

### API (`api/wrangler.toml`)

```toml
[vars]
BETTER_AUTH_URL = "https://your-api-domain.workers.dev"
BETTER_AUTH_SECRET = "your-secret-key"
```

### Frontend (`waku/.env`)

```env
WAKU_PUBLIC_API_URL=https://your-api-domain.workers.dev
```

## Session Status Flow

```
available → locking → reserved → in_use → completed
```

- **available**: Court is free
- **locking**: Court is locked for reservation (60s timeout)
- **reserved**: Reservation confirmed, waiting for start
- **in_use**: Session is active
- **completed**: Session ended

## User Roles

| Role   | Permissions                                                   |
| ------ | ------------------------------------------------------------- |
| admin  | Full access: manage courts, staff, users, settings            |
| staff  | Operational access: lock courts, manage sessions, view shifts |
| viewer | Read-only access: view court status and schedules             |

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
