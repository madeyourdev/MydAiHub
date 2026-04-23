# Security

ภาพรวมความปลอดภัยทั้งระบบ — ครอบคลุมสิ่งที่ implement แล้ว, การตั้งค่า, และ fixes ที่ทำไป

---

## 1. Authentication

### JWT + httpOnly Cookie

- JWT ถูก sign ด้วย `JWT_SECRET` (required — app ไม่ขึ้นถ้าไม่มี, ดู `src/auth/jwt.strategy.ts:11`)
- Token ถูกเก็บใน **httpOnly cookie** ชื่อ `access_token` — JavaScript อ่านไม่ได้ ป้องกัน XSS token theft
- `JwtStrategy` อ่าน token จาก cookie ก่อน แล้ว fallback ไป `Authorization: Bearer` header

### Cookie properties

| Property | Dev | Production | เหตุผล |
|---|---|---|---|
| `httpOnly` | true | true | JS อ่านไม่ได้ |
| `secure` | false | true | ส่งผ่าน HTTPS เท่านั้น |
| `sameSite` | `lax` | `none` | frontend/backend คนละ domain — ต้อง `none` เพื่อส่ง cookie ข้าม domain |
| `maxAge` | `COOKIE_EXPIRES_DAYS` × 86400000 ms | เดียวกัน | กำหนดใน `.env` |

> `sameSite: none` ใช้ชั่วคราวจนกว่าจะมี custom domain ที่ frontend/backend อยู่ subdomain เดียวกัน — ดู `docs/future-features.md`

### Token validation ทุก request

`JwtStrategy.validate()` ทำ DB lookup ทุก request เพื่อยืนยันว่า user ยังมีอยู่และ `status = ACTIVE` — ถ้า admin ปิด account (`status = DELETED`) token เดิมใช้ไม่ได้ทันที

### Google OAuth

- Verify Google ID token ด้วย `google-auth-library` ก่อน trust payload ทุกครั้ง
- ถ้า email ตรงกับ user ที่มีอยู่ → link `googleId` เข้ากับ account เดิม (ไม่สร้าง duplicate)

---

## 2. Authorization

### Role-based Access Control

สองระดับ ใช้ร่วมกัน:

```
@UseGuards(JwtAuthGuard)              → ต้อง login
@UseGuards(JwtAuthGuard, RolesGuard)  → ต้อง login + role ถูกต้อง
@Roles(Role.ADMIN)                    → เฉพาะ ADMIN
```

| Route group | Guard |
|---|---|
| `GET /users/me` | JwtAuthGuard |
| `POST /chat/*`, `GET /chat/*`, `DELETE /chat/*` | JwtAuthGuard |
| `GET /admin/*`, `PATCH /admin/*` | JwtAuthGuard + RolesGuard (ADMIN) |

### Ownership check

Chat endpoints ตรวจ `conversation.userId === req.user.userId` ก่อนทุก operation — user อ่านหรือลบ conversation ของคนอื่นไม่ได้แม้จะรู้ ID

---

## 3. Rate Limiting

Global default: **60 requests/minute** ทุก endpoint (ตั้งใน `AppModule` via `ThrottlerModule`)

Override เฉพาะ endpoint:

| Endpoint | Limit |
|---|---|
| `POST /auth/register` | 5 req/min |
| `POST /auth/login` | 10 req/min |
| `POST /auth/google` | 10 req/min |
| `POST /chat/message` | 20 req/min |
| `DELETE /chat/conversations/:id` | 30 req/min |

---

## 4. Input Validation

Global `ValidationPipe` ตั้งที่ `main.ts`:
- `whitelist: true` — ตัด field ที่ไม่ได้ประกาศใน DTO ออกอัตโนมัติ ป้องกัน mass assignment
- `transform: true` — แปลง type ให้ตรง DTO ก่อนส่งเข้า handler

### RegisterDto / LoginDto (`src/auth/dto/auth.dto.ts`)

| Field | Rules |
|---|---|
| `username` | string, MinLength(3), MaxLength(30), `[a-zA-Z0-9_-]` เท่านั้น |
| `email` | IsEmail format |
| `password` | string, MinLength(8) |

### SendMessageDto (`src/chat/chat.controller.ts`)

| Field | Rules |
|---|---|
| `message` | string, MinLength(1), MaxLength(4000) |
| `model` | optional string |
| `conversationId` | optional string |

### UpdateUserDto (`src/admin/dto/update-user.dto.ts`)

| Field | Rules |
|---|---|
| `credits` | optional int, Min(0) |
| `role` | optional, IsEnum(Role) |
| `status` | optional, IsEnum(UserStatus) |
| `aiModel` | optional, IsIn(AI_MODELS whitelist) |

---

## 5. SQL Injection

ใช้ **Prisma ORM** ทั้งระบบ — ไม่มี raw SQL query ใดๆ Prisma ใช้ parameterized queries ทุก operation โดย default ป้องกัน SQL injection โดยสมบูรณ์

---

## 6. XSS Prevention

### Backend

`ValidationPipe` whitelist ตัด field แปลกออก ก่อนที่ข้อมูลจะถึง DB

### Frontend

ทุก field ที่ render ผ่าน `innerHTML` ถูก escape ด้วย `escapeHtml()` / `escHtml()`:

```typescript
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

fields ที่ escape: `username`, `email`, `title`, `content`, `aiModel`, conversation preview

---

## 7. HTTP Security Headers

`helmet()` เปิดใช้งานที่ `main.ts` — ครอบคลุม:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy` (Helmet default)

---

## 8. CORS

```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});
```

รับ request จาก frontend origin ที่กำหนดเท่านั้น `credentials: true` จำเป็นสำหรับการส่ง cookie ข้าม domain

---

## 9. Database Security

### SSL

`PrismaService` ต่อ Supabase ด้วย SSL:
- Production: `rejectUnauthorized: true` + CA cert จาก `SUPABASE_SSL_CERT` (base64) — app ไม่ขึ้นถ้าไม่มี
- Dev: `rejectUnauthorized: false` (ไม่มี cert ก็ต่อได้)

### Connection

ใช้ Transaction Pooler (port 6543) ที่ runtime และ Session Pooler (port 5432) สำหรับ Prisma CLI migrations

### Soft Delete

User ไม่ถูกลบจริง — เปลี่ยน `status = DELETED` แทน ทุก query filter `status = ACTIVE` เสมอ ทำให้ account ที่ถูกปิดใช้ token เดิมต่อไม่ได้

---

## 10. Password Security

- Hash ด้วย `bcrypt` salt rounds 10 ก่อน save ลง DB ทุกครั้ง
- Password ไม่ถูก select กลับมาใน response ใดๆ (destructure ออกก่อน return)
- Google OAuth user ไม่มี password field (`password` เป็น nullable)

---

## 11. Secret Management

| Variable | Required | Behavior ถ้าไม่มี |
|---|---|---|
| `JWT_SECRET` | ✅ | App ไม่ขึ้น |
| `SUPABASE_SSL_CERT` | ✅ production | App ไม่ขึ้น |
| `GROQ_API_KEY` | ✅ | App ไม่ขึ้น |
| `DATABASE_URL` | ✅ | App ไม่ขึ้น |
| `GOOGLE_CLIENT_ID` | optional | Google login ใช้ไม่ได้ |

`.env` อยู่ใน `.gitignore` — ไม่ commit ลง repository

---

## 12. Data Expiry

Conversation ที่ไม่มีการใช้งานนานกว่า 7 วัน (`updatedAt < now - 7d`) ถูกลบอัตโนมัติโดย cron job ที่รันทุกวันเวลา 02:00 (`@Cron(CronExpression.EVERY_DAY_AT_2AM)`) — ใช้ NestJS Logger บันทึกจำนวนที่ลบ

Message ถูก cascade delete ตาม Conversation ผ่าน `onDelete: Cascade` ใน Prisma schema

---

## Known Limitations

| เรื่อง | สถานะ |
|---|---|
| `sameSite: none` ใน production | ชั่วคราว — รอ custom domain ให้ frontend/backend อยู่ subdomain เดียวกัน |
| ไม่มี CSRF token | ยอมรับได้ในขั้นนี้ เพราะ `secure + sameSite` + cookie-only auth ลด risk ได้มาก |
| ไม่มี payment gateway | เติม credits ผ่าน Admin Panel เท่านั้น |
