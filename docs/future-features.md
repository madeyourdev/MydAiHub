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

#### 4. Rate Limiting บน Auth endpoints
**ไฟล์:** `src/main.ts`, ติดตั้ง `@nestjs/throttler`

ตอนนี้ `/auth/login` และ `/auth/register` ไม่มีการจำกัด request ทำให้ brute force ได้อิสระ

```bash
npm install @nestjs/throttler
```

```typescript
// main.ts หรือ AppModule
ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])

// auth.controller.ts
@UseGuards(ThrottlerGuard)
@Post('login')
```

#### 5. เพิ่ม Helmet (HTTP Security Headers)
**ไฟล์:** `src/main.ts`, ติดตั้ง `helmet`

ไม่มี headers เช่น `X-Frame-Options`, `Content-Security-Policy`, `X-XSS-Protection` เลย

```bash
npm install helmet
```

```typescript
import helmet from 'helmet';
app.use(helmet());
```

#### 6. JWT Strategy ตรวจสอบ user ใน DB
**ไฟล์:** `src/auth/jwt.strategy.ts`

ตอนนี้ `validate()` ไม่ query DB เลย ถ้า delete user ออกไปแล้ว token เดิมยังใช้งานได้จนหมดอายุ

```typescript
async validate(payload: any) {
  const user = await this.usersService.findById(payload.sub);
  if (!user) throw new UnauthorizedException();
  return { userId: payload.sub, email: payload.email, role: payload.role };
}
```

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
| Rate limiting | ❌ ยังไม่มี |
| Helmet headers | ❌ ยังไม่มี |
| JWT validates user exists in DB | ❌ ยังไม่มี |

