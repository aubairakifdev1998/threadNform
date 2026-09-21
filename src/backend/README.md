# Fareya Backend

NestJS API for Fareya UK fashion e-commerce — **Clean Architecture** + **Supabase** (Auth, Postgres, Storage).

Design docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`ASSUMPTIONS.md`](./ASSUMPTIONS.md)

## Architecture

```
src/
├── domain/              # Entities, ports, money/VAT/UK address, state machines
├── application/         # Use cases (checkout, payments, order lifecycle)
├── infrastructure/      # Supabase adapters + notification stub
└── presentation/        # Controllers, DTOs, RBAC guards, envelopes
```

API prefix: `/api/v1`  
Responses: `{ success: true, data }` / `{ success: false, error: { code, message, details } }`

## Setup

1. Copy env and fill credentials:

```bash
cp .env.example .env
```

| Env var | Where to get it |
|---------|-----------------|
| `SUPABASE_URL` | Dashboard → Project Settings → API → Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | API → Publishable key (`sb_publishable_…`) |
| `SUPABASE_SECRET_KEY` | API → Secret key (`sb_secret_…`) — **server only** |
| `DATABASE_URL` | Dashboard → Project Settings → Database → Connect → URI |

2. Apply migrations (pick one):

**A. CLI (recommended)**

```bash
# Add DATABASE_URL to .env, then:
npm run db:migrate
npm run db:verify
```

**B. SQL Editor**

Paste and run [`supabase/ALL_MIGRATIONS.sql`](./supabase/ALL_MIGRATIONS.sql) once in the SQL Editor.

3. Start API:

```bash
npm install
npm run start:dev
```

- Health: `GET http://localhost:3000/api/v1/health`
- Ready (DB): `GET http://localhost:3000/api/v1/health/ready`

## Frontend connection

Point the Next.js app (`src/frontend`) at:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
```

Storefront/admin runs on port **3001** by default (`npm run dev` in `src/frontend`).
CORS allows `localhost` / `127.0.0.1` any port in dev. Send:

- `Authorization: Bearer <supabase_access_token>` for authenticated routes
- `Idempotency-Key: <uuid>` on `POST /checkout` and payment approve
- Guest cart: create via `POST /carts`, keep returned `guestToken`

Envelope:

```json
{ "success": true, "data": { } }
```

```json
{ "success": false, "error": { "code": "…", "message": "…", "details": {} } }
```

## Main endpoints

| Area | Examples |
|------|----------|
| Auth | `POST /auth/sign-up`, `sign-in`, `GET /auth/me` |
| Catalog | `GET /departments`, `/categories`, `/products`, `/products/:slug` |
| Cart | `POST /carts`, `POST /carts/:id/items`, `POST /carts/merge` |
| Checkout | `POST /checkout`, `POST /checkout/authenticated` |
| Orders | `GET /orders`, `GET /orders/:orderNumber`, payment-proofs, returns |
| Shipping | `GET /shipping/methods` |
| Admin | `/admin/products`, `/admin/inventory/*`, `/admin/orders`, `/admin/payments/*`, `/admin/dashboard` |
| Storage | `POST /storage/upload`, `GET /storage/url` |
| Health | `GET /health`, `GET /health/ready` |

Money is **integer pence**. Inventory uses Postgres RPCs with row locks. Payment V1 = bank transfer + proof + admin verify.

## Scripts

- `npm run start:dev` — API watch mode
- `npm run db:migrate` — apply SQL migrations via `DATABASE_URL`
- `npm run db:verify` — confirm tables + seed + RPCs
- `npm test` / `npm run test:e2e` / `npm run build`

OpenAPI UI: `http://localhost:3000/api/v1/docs`

## Vercel (production API)

Root Directory for the backend project must be `src/backend`.

Deploy uses `vercel.json` + `api/index.js` (serverless Nest handler). Required **Vercel Environment Variables** (Production):

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | Supabase pooler URI |
| `SUPABASE_URL` | `https://….supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` |
| `FRONTEND_URL` | `https://thread-nform-txkk.vercel.app` |
| `CORS_ORIGINS` | `https://thread-nform-txkk.vercel.app` (+ localhost if needed) |
| `CART_TOKEN_SECRET` | long random secret |
| `API_PREFIX` | `api/v1` |

Without these, the function crashes on cold start (`FUNCTION_INVOCATION_FAILED`) and browsers report a **CORS** error because no Nest response (and no CORS headers) is returned.

After setting env vars, redeploy the backend project, then confirm:

```bash
curl -s https://thread-nform.vercel.app/api/v1/health
```

## Admin bootstrap

Owner credentials (local only) are written to `.admin-credentials.local` (gitignored).

Sign in via `POST /api/v1/auth/sign-in` with that email/password, then call `/admin/*` with the Bearer token.

## Secrets rotation

| Secret | Status / action |
|--------|-----------------|
| `CART_TOKEN_SECRET` | Rotated automatically |
| Owner password | Set in `.admin-credentials.local` |
| Database password | **Rotate in Dashboard** → Database → Reset password, then update `DATABASE_URL` (client cannot `ALTER` the `postgres` role) |
| Publishable / secret API keys | **Rotate in Dashboard** → API Keys → create new keys, update `.env`, disable old keys (they were shared in chat) |

Optional email: set `SMTP_*` in `.env`. If unset, notifications are logged only.

