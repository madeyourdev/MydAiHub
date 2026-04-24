# Future Features

เอกสารนี้เก็บ feature ที่วางแผนไว้สำหรับอนาคต ยังไม่ได้ implement

---

## Role & Permission System

### สถานะปัจจุบัน

ใช้ **RBAC (Role-based Access Control)** แบบ enum ใน Prisma:

```prisma
enum Role {
  USER
  ADMIN
}
```

guard ที่ใช้: `RolesGuard` + `@Roles(Role.ADMIN)` decorator

---

### Phase 1 — เพิ่ม Role ใน enum (ระยะสั้น)

เมื่อต้องการ role เพิ่มเติมที่มีสิทธิ์ชัดเจน เช่น MODERATOR, EDITOR

**วิธีทำ:**
1. เพิ่ม role ใน `prisma/schema.prisma`
2. `npx prisma db push && npx prisma generate`
3. ใช้ `@Roles(Role.MODERATOR)` ใน controller ได้เลย

**เหมาะกับ:** role ไม่เกิน 4-5 แบบ และสิทธิ์ของแต่ละ role ชัดเจน ไม่ overlap

---

### Phase 2 — Permission-based (ระยะยาว)

เมื่อต้องการ customize สิทธิ์รายคน หรือ admin บางคนทำได้ไม่เหมือนกัน

**โครงสร้าง DB ที่ต้องเพิ่ม:**

```prisma
model Permission {
  id    String @id @default(uuid())
  name  String @unique  // เช่น "user:delete", "post:write"
  roles RolePermission[]
}

model RolePermission {
  role         Role
  permissionId String
  permission   Permission @relation(fields: [permissionId], references: [id])
  @@id([role, permissionId])
}
```

**ตัวอย่าง permission matrix:**

| Permission | USER | EDITOR | ADMIN |
|---|---|---|---|
| `user:read` | ✅ | ✅ | ✅ |
| `post:write` | ❌ | ✅ | ✅ |
| `user:delete` | ❌ | ❌ | ✅ |

**วิธีใช้งาน (แนวทาง):**

```typescript
// decorator ใหม่
@RequirePermission('user:delete')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Delete('users/:id')
deleteUser() { ... }
```

**เหมาะกับ:** ระบบที่ต้องการ customize สิทธิ์ละเอียด หรือมี role มากกว่า 5 แบบ

---

### เกณฑ์การตัดสินใจ upgrade

ควร upgrade จาก Phase 1 → Phase 2 เมื่อ:
- มี role มากกว่า 5 แบบ
- admin บางคนต้องมีสิทธิ์ต่างกัน
- ต้องการ assign permission รายคนได้

---

## Security Hardening

ผลจากการ audit ระบบ backend พบจุดที่ต้องปรับปรุง แบ่งตามความเร่งด่วน

---

### 🔴 Critical — ต้องแก้ก่อน production จริง

#### ~~1. ลบ `role` ออกจาก RegisterDto~~ ✅ แก้แล้ว
**ไฟล์:** `src/auth/dto/auth.dto.ts`, `src/auth/auth.service.ts`

ลบ `role?: Role` ออกจาก `RegisterDto` และเปลี่ยน `usersService.create({ ...data })` เป็น explicit fields เพื่อกันไม่ให้ field แปลกปลอมลอดเข้า DB ได้แม้จะเลี่ยง DTO

#### ~~2. ห้าม fallback JWT Secret~~ ✅ แก้แล้ว
**ไฟล์:** `src/auth/auth.module.ts`, `src/auth/jwt.strategy.ts`

เปลี่ยนจาก `|| 'default-super-secret-key'` เป็น throw error ถ้าไม่มี `JWT_SECRET` ใน env ทั้งสองไฟล์ app จะไม่ขึ้นถ้าลืมตั้งค่า

#### ~~3. เปิด SSL certificate validation สำหรับ DB~~ ✅ แก้แล้ว (ต้องตั้ง env ใน Railway)
**ไฟล์:** `src/prisma/prisma.service.ts`, `.env.example`

เปลี่ยนเป็น `rejectUnauthorized: true` พร้อม Supabase CA cert — logic แบ่งตาม environment:
- **Dev:** ไม่มี `SUPABASE_SSL_CERT` → `rejectUnauthorized: false` อัตโนมัติ
- **Production:** ต้องตั้ง `SUPABASE_SSL_CERT` (base64 ของ cert จาก Supabase Dashboard) ถ้าไม่ตั้ง app จะไม่ขึ้น

วิธีได้ค่า `SUPABASE_SSL_CERT`:
1. Supabase Dashboard → Project Settings → Database → Download Certificate
2. `base64 -i prod-ca-2021.crt | tr -d '\n'`
3. ตั้งเป็น env var ใน Railway

---

### 🟡 High — ควรแก้ก่อน launch

#### ~~4. Rate Limiting บน Auth endpoints~~ ✅ แก้แล้ว
**ไฟล์:** `src/app.module.ts`, `src/auth/auth.controller.ts`

ติดตั้ง `@nestjs/throttler` และตั้งค่าดังนี้:
- Global default: **60 req/นาที** ต่อ IP (ทุก endpoint)
- `POST /auth/login`: **10 req/นาที** ต่อ IP
- `POST /auth/register`: **5 req/นาที** ต่อ IP
- `POST /auth/google`: **10 req/นาที** ต่อ IP

เกินกำหนด → `429 Too Many Requests`

#### ~~5. เพิ่ม Helmet (HTTP Security Headers)~~ ✅ แก้แล้ว
**ไฟล์:** `src/main.ts`

ติดตั้ง `helmet` และเพิ่ม `app.use(helmet())` ก่อน middleware อื่น ทำให้ทุก response มี security headers ครบ ได้แก่ `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`

#### ~~6. JWT Strategy ตรวจสอบ user ใน DB~~ ✅ แก้แล้ว
**ไฟล์:** `src/auth/jwt.strategy.ts`

inject `UsersService` เข้า `JwtStrategy` แล้วให้ `validate()` query DB ทุกครั้ง ถ้า user ถูกลบออกไปแล้ว token เดิมจะใช้งานไม่ได้ทันที → `401 Unauthorized`

---

### 🟢 Medium — ปรับปรุงคุณภาพ

#### 7. เพิ่ม `forbidNonWhitelisted` ใน ValidationPipe
**ไฟล์:** `src/main.ts`

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,  // reject request ถ้ามี field แปลกปลอม
}));
```

#### 8. เพิ่ม password minimum length
**ไฟล์:** `src/auth/dto/auth.dto.ts`

ปัจจุบัน `MinLength(6)` ควรเป็น `MinLength(8)` และอาจเพิ่ม pattern validation

#### 9. ~~`sameSite` cookie~~ — ใช้ `none` ชั่วคราว รอ custom domain
**ไฟล์:** `src/auth/auth.service.ts` — `getCookieOptions()`

ตอนนี้ frontend (`frontend-production-640a.up.railway.app`) และ backend (`mydaihub-production.up.railway.app`) อยู่คนละ domain กัน ทำให้ต้องใช้ `SameSite: none` เพื่อให้ browser ส่ง cookie ข้าม domain ได้ ซึ่งลด CSRF protection ลง แต่ยังมี CORS guard ช่วยอยู่

**แผนระยะยาว:** เมื่อมี custom domain ให้ย้ายมาใช้ subdomain เดียวกัน แล้วเปลี่ยนกลับเป็น `SameSite: lax`
```
app.mydaihub.com   → frontend
api.mydaihub.com   → backend
```

---

## Dynamic Quick Prompt Chips

### สถานะปัจจุบัน

Quick prompt chips บนหน้า Chat เป็น **hardcoded 8 ตัวคงที่** (`Translate`, `Summarize`, `Write code` ฯลฯ) ใน `frontend/chat.html` — ยังไม่ได้ดึงจากข้อมูลจริงของ user

### เป้าหมาย

แสดง chips ที่สะท้อน **topic ที่ user ในระบบถามบ่อยที่สุด** จริงๆ — chips เปลี่ยนตาม behavior ของผู้ใช้โดยอัตโนมัติ

---

### แนวทางที่แนะนำ: Cron + PromptStat table

แบ่ง concern ชัดเจนระหว่าง "คำนวณ" (background) กับ "อ่าน" (instant)

**Flow:**
```
Cron ทุก 6 ชั่วโมง
  → query first message ของแต่ละ Conversation
  → match กับ keyword categories (translate, code, explain ฯลฯ)
  → upsert count ลง PromptStat table (ไม่เกิน 8 แถว)

GET /chat/popular-prompts
  → SELECT top 8 FROM PromptStat (instant)
  → frontend render chips ตาม rank จริง
```

**DB Schema ที่ต้องเพิ่ม:**
```prisma
model PromptStat {
  id        String   @id @default(uuid())
  category  String   @unique  // "translate", "code", "explain" ฯลฯ
  label     String            // "🌐 Translate"
  prompt    String            // template ที่ pre-fill ใน input
  count     Int      @default(0)
  updatedAt DateTime @updatedAt
}
```

**Keyword categories (ตัวอย่าง):**

| Category | Keywords | Label | Prompt template |
|---|---|---|---|
| translate | translate, แปล | 🌐 Translate | `Translate the following to English:\n` |
| code | code, function, bug, script | 💻 Write code | `Write code to ` |
| explain | explain, อธิบาย, what is, คืออะไร | 💡 Explain | `Explain how ` |
| summarize | summarize, สรุป, summary | 📝 Summarize | `Summarize the following:\n` |
| fix | fix, grammar, แก้, error | ✏️ Fix grammar | `Fix the grammar and improve:\n` |
| brainstorm | idea, brainstorm, suggest, แนะนำ | 🧠 Brainstorm | `Brainstorm 5 ideas for ` |
| compare | compare, เปรียบเทียบ, vs, difference | ⚖️ Compare | `Compare ` |
| howto | how to, วิธี, step, guide | 📋 How to | `Create a step-by-step guide on ` |

**Fallback:** ถ้า category ไหนยังไม่มีข้อมูล (system ใหม่) ใช้ hardcoded default แทน

---

### ทางเลือกอื่น (ถ้าไม่อยากสร้าง table ใหม่)

**Track chip clicks** — นับว่า chip ไหนถูกกดบ่อยสุด แล้วเรียงใหม่
- ง่ายกว่า: เพิ่ม counter ใน DB หรือ in-memory
- ข้อเสีย: chips ยังเป็น 8 ตัวเดิม แค่เรียงใหม่ตาม popularity ไม่ได้ reflect conversation จริง

---

## Upcoming Business Features

### ~~1. Payment Gateway Integration~~ ✅ implement แล้ว

ระบบชำระเงิน Omise + PromptPay QR implement แล้ว ดูรายละเอียดใน `docs/payments.md`

**สถานะ:** sandbox mode — ก่อนขึ้น production ต้องเปลี่ยน keys และตั้ง webhook ตาม checklist ใน `docs/payments.md`

### ~~2. AI Provider Migration (Groq → OpenRouter)~~ ✅ implement แล้ว

`baseURL` เปลี่ยนเป็น `https://openrouter.ai/api/v1` และใช้ `OPENROUTER_API_KEY` แล้ว รองรับโมเดลจากทุก provider ผ่าน API เดียว ดู model list ใน `src/admin/dto/update-user.dto.ts`

### 3. Dynamic AI Models Management
**ปัญหาปัจจุบัน:** รายชื่อโมเดลตัวเลือก (Dropdown) ถูกฝังโค้ดติดตัวหนังสือไว้ (Hardcoded) ใน `frontend/admin.html`
**แผนพัฒนา:**
- สร้าง Database Schema แยกตารางเช่น `ModelProvider` เพื่อเก็บ (name, provider_slug, cost_per_credit, isOpen)
- สร้าง API Endpoint `GET /models` ให้ Frontend ดึงมาแทน
- แอดมินจัดการ ปิด-เปิด เพิ่มตัว AI ให้ลูกค้าได้เรียลไทม์ผ่านแดชบอร์ด โดยไม่ต้องแก้โค้ดชิ้นใดชิ้นหนึ่ง และ Deploy ใหม่

### 4. User Status Management (Soft Delete / Ban)
**ปัญหาปัจจุบัน:** ใน `schema.prisma` มีคอลัมน์ `status` (ACTIVE / DELETED) แล้ว แต่ยังขาด Front-End Management 
**แผนพัฒนา:**
- ใช้งานระบบ Soft-Delete เพื่อเก็บรักษา History ของข้อความและแชทไว้ตามหลัก Data Governance
- เพิ่มเมนูใน Admin Panel เพื่อกด แบน(Ban) หรือ ปิดบัญชี ผู้ใช้ได้ด้วยคลิกเดียว

---

### สรุปสถานะปัจจุบัน

| หัวข้อ | สถานะ |
|---|---|
| Password hashing (bcrypt) | ✅ ดีแล้ว |
| httpOnly cookie | ✅ ดีแล้ว |
| Input validation (class-validator) | ✅ มีแล้ว |
| HTTPS (Railway จัดการให้) | ✅ ดีแล้ว |
| JWT expire | ✅ มีแล้ว |
| Privilege escalation via register | ✅ แก้แล้ว |
| JWT Secret fallback | ✅ แก้แล้ว |
| SSL DB rejectUnauthorized | ✅ แก้แล้ว (ต้องตั้ง `SUPABASE_SSL_CERT` ใน Railway) |
| Rate limiting | ✅ แก้แล้ว |
| Helmet headers | ✅ แก้แล้ว |
| JWT validates user exists in DB | ✅ แก้แล้ว |
| Conversation history (multi-turn chat) | ✅ implement แล้ว — `Conversation` + `Message` tables |
| Chat auto-delete expired conversations | ✅ implement แล้ว — cron ทุกคืน 02:00 ลบ conversation ที่ inactive > 7 วัน |
| Admin กำหนด AI model default ให้ user | ✅ implement แล้ว — `user.aiModel` + frontend pre-select |
| Payment Gateway (PromptPay QR) | ✅ implement แล้ว — Omise sandbox, ดู `docs/payments.md` สำหรับ production checklist |

