# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (root)
```bash
npm run start:dev      # development with hot reload
npm run build          # compile TypeScript to dist/
npm run start:prod     # run compiled output
npm run test           # unit tests (jest)
npm run test:e2e       # end-to-end tests
npm run test:cov       # test coverage
npm run lint           # ESLint with auto-fix
```

Run a single test file:
```bash
npx jest src/auth/auth.service.spec.ts
```

### Database (Prisma 7)
```bash
npx prisma migrate dev --name <migration-name>   # create & apply migration
npx prisma generate                              # regenerate client — must run after any schema edit
npx prisma studio                                # GUI for database
```

### Frontend (`frontend/`)
```bash
cd frontend && npm run dev      # Vite dev server
cd frontend && npm run build    # production build
cd frontend && npm run start    # serve built files (ใช้ใน Railway)
```

## Deployment: Railway

Monorepo deploy บน Railway เป็น 2 service แยกกันจาก repo เดียวกัน

### Backend Service
- Root Directory: ว่าง (root)
- Build: `npm run build`
- Start: `npm run start:prod`

**Environment variables ที่ต้องตั้ง:**
| Variable | หมายเหตุ |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase Transaction Pooler port 6543 |
| `DIRECT_URL` | Supabase Session Pooler port 5432 |
| `JWT_SECRET` | random string ยาวๆ — **app ไม่ขึ้นถ้าไม่มี** |
| `JWT_EXPIRES_IN` | เช่น `7d` |
| `COOKIE_EXPIRES_DAYS` | เช่น `7` |
| `FRONTEND_URL` | URL ของ frontend service บน Railway |
| `GOOGLE_CLIENT_ID` | จาก Google Cloud Console |
| `SUPABASE_SSL_CERT` | base64 ของ Supabase CA cert — **app ไม่ขึ้นถ้าไม่มีใน production** |
| `OPENROUTER_API_KEY` | openrouter.ai/keys — ใช้สำหรับ Chat AI (รองรับหลาย provider) |
| `PORT` | Railway ตั้งให้อัตโนมัติ |

### Frontend Service
- Root Directory: `frontend`
- Build: `npm run build`
- Start: `npm run start`

**Environment variables ที่ต้องตั้ง (ต้องตั้งก่อน build):**
| Variable | หมายเหตุ |
|---|---|
| `VITE_API_URL` | URL ของ backend service บน Railway |
| `VITE_GOOGLE_CLIENT_ID` | จาก Google Cloud Console |

**Health check:** `GET /health` — Railway ใช้ตรวจสอบว่า app พร้อมใช้งาน

## Database: Supabase

This project uses **Supabase** as the database provider (PostgreSQL). Two connection URLs are required in `.env`:

| Variable | Connection Type | Used by |
|---|---|---|
| `DATABASE_URL` | Transaction Pooler — port 6543 (`?pgbouncer=true`) | `PrismaService` at runtime |
| `DIRECT_URL` | Session Pooler — port 5432 | Prisma CLI migrations |

Both use the **Shared Pooler** (IPv4 compatible). Get URLs from:  
**Supabase Dashboard → Project Settings → Database → Connection pooling**

```
DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

## Architecture

This is a monorepo with two independent apps deployed on Railway:

**`/` (Backend)** — NestJS 11 API server on port 3000
**`/frontend`** — Vite MPA (Multi-Page App) — static site served via `vite preview`

### Backend module graph

```
AppModule
├── PrismaModule       → exports PrismaService (singleton DB client)
├── AuthModule         → POST /auth/register, POST /auth/login, POST /auth/google
│   │                    POST /auth/logout, GET /auth/profile, GET /auth/admin-only
│   └── imports UsersModule, PassportModule, JwtModule
├── UsersModule        → GET /users/me; exports UsersService
│   └── imports PrismaModule
├── AdminModule        → GET /admin/users, PATCH /admin/users/:id (ADMIN only)
│   └── imports PrismaModule
└── ChatModule         → POST /chat/message
                         GET /chat/conversations
                         GET /chat/conversations/:id/messages
                         DELETE /chat/conversations/:id
    └── imports PrismaModule, ScheduleModule (cron auto-delete expired conversations)
```

### Frontend pages

| หน้า | URL | ไฟล์ |
|---|---|---|
| Login | `/` | `index.html` + `src/main.ts` |
| Register | `/register.html` | `src/register.ts` |
| Dashboard | `/dashboard.html` | `src/dashboard.ts` |
| Chat | `/chat.html` | `src/chat.ts` |
| Top-up Credits | `/credits.html` | `src/credits.ts` |
| Admin Panel | `/admin.html` | `src/admin.ts` |

Sidebar (`src/sidebar.ts`) ถูก import ในทุกหน้าหลัง login — รับ `role` เป็น argument เพื่อ:
- แสดง Admin Panel link เฉพาะ role `ADMIN`
- ซ่อน Top-up Credits เฉพาะ role `ADMIN`

### Authentication flow

1. `POST /auth/register` → `AuthService.register()` → bcrypt hash → `UsersService.create()`
2. `POST /auth/login` → `AuthService.validateUser()` → bcrypt compare → `AuthService.login()` → JWT signed with `JWT_SECRET` (expires `JWT_EXPIRES_IN`) → set **httpOnly cookie** `access_token`
3. `POST /auth/google` → verify Google ID token → find/create user → set **httpOnly cookie** `access_token`
4. `POST /auth/logout` → `res.clearCookie('access_token')`
5. Protected routes use `@UseGuards(JwtAuthGuard)` — `JwtStrategy` อ่าน JWT จาก **cookie ก่อน** แล้ว fallback ไป Authorization header — `validate()` คืน `{ userId, email, role }` ใน `req.user`
6. Role-restricted routes เพิ่ม `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)`

### Cookie security

| Property | Value | เหตุผล |
|---|---|---|
| `httpOnly` | `true` | JS อ่านไม่ได้ ป้องกัน XSS |
| `secure` | `true` ใน production | ส่งผ่าน HTTPS เท่านั้น |
| `sameSite` | `none` ใน production, `lax` ใน dev | frontend/backend คนละ domain — ต้อง `none` เพื่อส่ง cookie ข้าม domain ได้ |
| `maxAge` | `COOKIE_EXPIRES_DAYS` × 86400000 ms | กำหนดได้ใน `.env` |

> **หมายเหตุ:** `sameSite: none` ใช้ชั่วคราวจนกว่าจะมี custom domain ที่ frontend/backend อยู่ subdomain เดียวกัน ดูแผนใน `docs/future-features.md`

Frontend ทุก fetch ต้องใส่ `credentials: 'include'` เพื่อให้ browser ส่ง cookie ไปด้วย

### Adding a new feature

When adding a new resource (e.g. `agents`):
1. Create `src/agents/agents.module.ts`, `agents.service.ts`, `agents.controller.ts`
2. Import `PrismaModule` in the new module
3. Add the new model to `prisma/schema.prisma`
4. Run `npx prisma migrate dev --name <migration-name>` then `npx prisma generate`
5. Register the new module in `AppModule`
6. **Update `docs/api.md`** — add every new endpoint under the correct HTTP method section with request body, response, and error codes

### Future Features

`docs/future-features.md` เก็บ feature ที่วางแผนไว้แต่ยังไม่ implement — อ่านก่อนออกแบบ feature ใหม่เพื่อให้สอดคล้องกับทิศทางของระบบ

### API Documentation Rule

`docs/api.md` is the source of truth for all API endpoints.

**Every time a new endpoint is added or modified, `docs/api.md` must be updated in the same change.** Document:
- HTTP method + path
- Description (ใช้ทำอะไร)
- Request body / params / headers
- Response shape (success)
- Error codes and reasons

Group endpoints by module (Auth, Users, etc.) and by HTTP method within each group.

### Environment variables

| Variable | Used by | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | `PrismaService` — runtime queries (Transaction Pooler port 6543) | |
| `DIRECT_URL` | `prisma.config.ts` — Prisma CLI migrations (Session Pooler port 5432) | |
| `JWT_SECRET` | `AuthModule` + `JwtStrategy` | **required** — app ไม่ขึ้นถ้าไม่มี |
| `JWT_EXPIRES_IN` | JWT token expiry | defaults `1d` |
| `COOKIE_EXPIRES_DAYS` | httpOnly cookie max age in days | defaults `1` |
| `FRONTEND_URL` | CORS allowed origin | defaults `http://localhost:5173` |
| `GOOGLE_CLIENT_ID` | Google OAuth — `/auth/google` | |
| `SUPABASE_SSL_CERT` | `PrismaService` — SSL cert (base64) | **required in production** |
| `OPENROUTER_API_KEY` | `ChatModule` — เรียก AI ผ่าน OpenRouter (รองรับ OpenAI, Anthropic, Google, Meta) | |
| `PORT` | `main.ts` | defaults `3000` |

### Credit system

Credits ถูกจัดการทั้งหมดฝั่ง **backend** — frontend ปรับตัวเลขเองไม่ได้

| ขั้นตอน | รายละเอียด |
|---|---|
| ตรวจสอบ | ก่อนเรียก OpenRouter API ทุกครั้ง — ถ้า `credits < CREDIT_COST` → ส่ง `400 Insufficient credits` |
| หัก | หลัง AI ตอบกลับสำเร็จ — `UPDATE user SET credits = credits - CREDIT_COST` |
| ค่า default | `CREDIT_COST = 1` ต่อ 1 message — แก้ได้ที่ `src/chat/chat.service.ts` |
| เติม | ผ่าน Top-up Credits (Omise PromptPay) หรือ Admin Panel (`PATCH /admin/users/:id`) |

Railway backend ต้องตั้ง `OPENROUTER_API_KEY` — สมัครที่ openrouter.ai/keys (มี free-tier models ใช้ได้เลย)
