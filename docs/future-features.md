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

