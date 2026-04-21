# API Reference

Base URL (local): `http://localhost:3000`  
Base URL (production): Railway URL จาก dashboard

---

## System

### GET /health
ตรวจสอบสถานะ server (ใช้โดย Railway health check)

**Response 200**
```json
{ "status": "ok" }
```

---

---

## Auth

### POST /auth/register
สมัครสมาชิกใหม่

**Request Body**
```json
{
  "username": "string",
  "email": "string (email format)",
  "password": "string (min 6 chars)",
  "role": "USER | ADMIN (optional, default: USER)"
}
```

**Response 201**
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "credits": 0,
  "role": "USER",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "lastLoginAt": null
}
```

**Errors**
- `400` — Username already exists
- `400` — Email already exists

---

### POST /auth/login
เข้าสู่ระบบ — set httpOnly cookie `access_token`

**Request Body**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response 200** — พร้อม set cookie `access_token` (httpOnly, expires ตาม `COOKIE_EXPIRES_DAYS`)
```json
{
  "access_token": "JWT string",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "role": "USER | ADMIN",
    "credits": 0,
    "lastLoginAt": "ISO8601"
  }
}
```

**Errors**
- `401` — Invalid credentials

---

### POST /auth/google
เข้าสู่ระบบด้วย Google — set httpOnly cookie `access_token` (สร้าง user ใหม่อัตโนมัติถ้ายังไม่มี)

**Request Body**
```json
{
  "credential": "Google ID token (JWT จาก Google Identity Services)"
}
```

**Response 200** — พร้อม set cookie `access_token` (httpOnly, expires ตาม `COOKIE_EXPIRES_DAYS`)
```json
{
  "access_token": "JWT string",
  "user": {
    "id": "uuid",
    "username": "string (auto-generated จาก email)",
    "email": "string",
    "role": "USER",
    "credits": 0,
    "lastLoginAt": "ISO8601"
  }
}
```

**Errors**
- `401` — Invalid Google credential

---

### POST /auth/logout
ออกจากระบบ — ลบ cookie `access_token`

**Headers**
```
Cookie: access_token=<JWT> (อัตโนมัติจาก browser)
```

**Response 200**
```json
{ "message": "Logged out successfully" }
```

**Errors**
- `401` — Unauthorized

---

### GET /auth/profile
ดูข้อมูล profile ของตัวเอง

**Auth** — ส่งผ่าน cookie อัตโนมัติ หรือ header:
```
Authorization: Bearer <access_token>
```

**Response 200**
```json
{
  "userId": "uuid",
  "email": "string",
  "role": "USER | ADMIN"
}
```

**Errors**
- `401` — Unauthorized (token หายหรือหมดอายุ)

---

### GET /auth/admin-only
ทดสอบ route ที่ ADMIN เข้าได้เท่านั้น

**Auth** — ส่งผ่าน cookie อัตโนมัติ หรือ header:
```
Authorization: Bearer <access_token>
```

**Response 200**
```json
{
  "message": "This is an admin protected route."
}
```

**Errors**
- `401` — Unauthorized
- `403` — Forbidden (role ไม่ใช่ ADMIN)

---

## Users

### GET /users/me
ดูข้อมูล profile แบบเต็มของตัวเอง (username, credits, role, dates)

**Auth** — ส่งผ่าน cookie อัตโนมัติ หรือ header:
```
Authorization: Bearer <access_token>
```

**Response 200**
```json
{
  "id": "uuid",
  "email": "string",
  "username": "string",
  "googleId": "string | null",
  "credits": 0,
  "role": "USER | ADMIN",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "lastLoginAt": "ISO8601 | null"
}
```

**Errors**
- `401` — Unauthorized
