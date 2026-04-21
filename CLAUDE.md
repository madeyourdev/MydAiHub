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
```

## Deployment: Railway

Deploy ผ่าน Railway โดย connect GitHub repo แล้วตั้งค่า environment variables

**ขั้นตอน:**
1. Push code ขึ้น GitHub
2. สร้าง project ใหม่ใน Railway → Deploy from GitHub repo
3. ตั้ง environment variables ทุกตัวใน Railway Dashboard → Variables (ดูจาก `.env.example`)
4. ตั้ง `NODE_ENV=production`
5. ตั้ง `FRONTEND_URL` เป็น URL ของ frontend จริง
6. Railway จะ build อัตโนมัติด้วย `npm run build` (รัน `prisma generate && nest build`)
7. Start ด้วย `npm run start:prod`

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

This is a monorepo with two independent apps:

**`/` (Backend)** — NestJS 11 API server on port 3000  

### Backend module graph

```
AppModule
├── PrismaModule       → exports PrismaService (singleton DB client)
├── AuthModule         → POST /auth/register, POST /auth/login, POST /auth/google
│   │                    POST /auth/logout, GET /auth/profile, GET /auth/admin-only
│   └── imports UsersModule, PassportModule, JwtModule
└── UsersModule        → no routes yet; exports UsersService
    └── imports PrismaModule
```

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
| `sameSite` | `lax` | ป้องกัน CSRF |
| `maxAge` | `COOKIE_EXPIRES_DAYS` × 86400000 ms | กำหนดได้ใน `.env` |

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

| Variable | Used by |
|---|---|
| `DATABASE_URL` | `PrismaService` — runtime queries via pg adapter (Transaction Pooler port 6543) |
| `DIRECT_URL` | `prisma.config.ts` — Prisma CLI migrations (Session Pooler port 5432) |
| `JWT_SECRET` | `AuthModule` + `JwtStrategy` — JWT signing/verification |
| `JWT_EXPIRES_IN` | JWT token expiry (e.g. `1d`, `7d`) — defaults to `1d` |
| `COOKIE_EXPIRES_DAYS` | httpOnly cookie max age in days — defaults to `1` |
| `FRONTEND_URL` | CORS allowed origin — defaults to `http://localhost:5173` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for `/auth/google` |
| `PORT` | `main.ts` — defaults to 3000 |
