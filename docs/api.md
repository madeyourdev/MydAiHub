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
  "username": "string (3–30 chars, a-z A-Z 0-9 _ - เท่านั้น)",
  "email": "string (email format)",
  "password": "string (min 8 chars)"
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

---

### PATCH /users/me
บันทึก AI model ที่ user เลือกเป็น default ของตัวเอง

**Auth** — cookie อัตโนมัติ

**Request Body**
```json
{ "aiModel": "meta-llama/llama-3.3-70b-instruct:free" }
```

**Response 200**
```json
{ "aiModel": "meta-llama/llama-3.3-70b-instruct:free" }
```

**Errors**
- `400` — aiModel ไม่อยู่ใน whitelist
- `401` — Unauthorized

---

## Admin

> ทุก endpoint ในหมวดนี้ต้องการ role `ADMIN` — ถ้าไม่ใช่จะได้ `403 Forbidden`

### GET /admin/users
ดึงรายชื่อ user ทั้งหมดในระบบ

**Auth** — cookie หรือ Bearer token (ADMIN เท่านั้น)

**Response 200**
```json
[
  {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "role": "USER | ADMIN",
    "status": "ACTIVE | DELETED",
    "credits": 0,
    "aiModel": "meta-llama/llama-3.3-70b-instruct:free",
    "createdAt": "ISO8601",
    "lastLoginAt": "ISO8601 | null"
  }
]
```

**Errors**
- `401` — Unauthorized
- `403` — Forbidden (ไม่ใช่ ADMIN)

---

### PATCH /admin/users/:id
แก้ไขข้อมูล user — credits, role, aiModel, status

**Auth** — cookie หรือ Bearer token (ADMIN เท่านั้น)

**Request Body** (ส่งเฉพาะ field ที่ต้องการแก้)
```json
{
  "credits": 500,
  "role": "USER | ADMIN",
  "aiModel": "OpenRouter model ID — ดู whitelist ใน src/admin/dto/update-user.dto.ts",
  "status": "ACTIVE | DELETED"
}
```

**Response 200**
```json
{
  "id": "uuid",
  "username": "string",
  "email": "string",
  "role": "USER | ADMIN",
  "status": "ACTIVE | DELETED",
  "credits": 500,
  "aiModel": "meta-llama/llama-3.3-70b-instruct:free",
  "createdAt": "ISO8601",
  "lastLoginAt": "ISO8601 | null"
}
```

**Errors**
- `400` — aiModel ไม่อยู่ใน whitelist
- `401` — Unauthorized
- `403` — Forbidden (ไม่ใช่ ADMIN)
- `404` — User not found

---

## Chat

> ทุก endpoint ในหมวดนี้ต้อง login ก่อน (JWT cookie)

### POST /chat/message
ส่งข้อความหา AI และหัก credits อัตโนมัติ ถ้าไม่ส่ง `conversationId` จะสร้าง Conversation ใหม่อัตโนมัติ

**หลักการหัก credits**
- Backend เป็นผู้จัดการทั้งหมด — frontend ปรับตัวเลขเองไม่ได้
- ตรวจยอด credits ก่อนเรียก AI ทุกครั้ง (ต้องมีอย่างน้อย 1 credit)
- หัก credits ตาม token จริงที่ใช้: `max(1, ceil((inputTokens + outputTokens) / 1000))`
- ถ้า credits ไม่พอ → ส่ง error กลับ ไม่เรียก AI

**Rate Limit** — สูงสุด 20 messages ต่อ user ต่อ 60 วินาที (429 ถ้าเกิน)

**Auth** — ส่งผ่าน cookie อัตโนมัติ

**Request Body**
```json
{
  "message": "string (required, max 4000 chars)",
  "model": "OpenRouter model ID (optional) — ดู whitelist ใน src/admin/dto/update-user.dto.ts, default: meta-llama/llama-3.3-70b-instruct:free",
  "conversationId": "uuid (optional — ถ้าไม่ส่งจะสร้าง conversation ใหม่)"
}
```

**Response 200**
```json
{
  "reply": "string (คำตอบจาก AI)",
  "credits": 99,
  "conversationId": "uuid"
}
```

**Errors**
- `400` — Message cannot be empty
- `400` — Insufficient credits
- `401` — Unauthorized
- `404` — Conversation not found
- `429` — Rate limit exceeded (20 messages/minute per user)
- `500` — Failed to get response from AI

---

### POST /chat/stream
เหมือน `/chat/message` แต่ส่งคำตอบเป็น Server-Sent Events (SSE) แบบ real-time — AI พิมพ์ทีละ token

**หลักการหัก credits** — เหมือนกับ `/chat/message` (token-based, deduct หลัง stream จบ)

**Rate Limit** — สูงสุด 20 messages ต่อ user ต่อ 60 วินาที

**Auth** — ส่งผ่าน cookie อัตโนมัติ

**Request Body**
```json
{
  "message": "string (required, max 4000 chars)",
  "model": "OpenRouter model ID (optional)",
  "conversationId": "uuid (optional)"
}
```

**Response** — `Content-Type: text/event-stream`

แต่ละ event เป็น `data: <JSON>\n\n`:

```
data: {"type":"chunk","content":"Hello"}

data: {"type":"chunk","content":" world"}

data: {"type":"done","credits":98,"conversationId":"uuid"}
```

| type | เมื่อไหร่ | fields |
|---|---|---|
| `chunk` | ทุกครั้งที่ได้ token ใหม่ | `content: string` |
| `done` | หลัง stream จบ บันทึก DB แล้ว | `credits: number`, `conversationId: string` |
| `error` | ถ้า AI error หลัง stream เริ่มแล้ว | `message: string` |

**Errors (ก่อน stream เริ่ม — JSON ปกติ)**
- `400` — Message cannot be empty / Insufficient credits
- `401` — Unauthorized
- `404` — Conversation not found
- `429` — Rate limit exceeded

---

### GET /chat/conversations
ดึงรายการ conversation ทั้งหมดของ user เรียงตาม updatedAt ล่าสุด

**Auth** — cookie อัตโนมัติ

**Response 200**
```json
[
  {
    "id": "uuid",
    "title": "string | null",
    "updatedAt": "ISO8601",
    "messages": [
      { "role": "assistant", "content": "string (last message preview)" }
    ]
  }
]
```

**Errors**
- `401` — Unauthorized

---

### GET /chat/conversations/:id/messages
ดึง message ทั้งหมดในห้องสนทนา เรียงจากเก่าไปใหม่

**Auth** — cookie อัตโนมัติ (ต้องเป็น owner ของ conversation)

**Response 200**
```json
[
  {
    "id": "uuid",
    "role": "user | assistant",
    "content": "string",
    "model": "string",
    "createdAt": "ISO8601"
  }
]
```

**Errors**
- `401` — Unauthorized
- `403` — Forbidden (ไม่ใช่ owner)
- `404` — Conversation not found

---

### DELETE /chat/conversations/:id
ลบ conversation และ message ทั้งหมดในนั้น (cascade delete)

**Auth** — cookie อัตโนมัติ (ต้องเป็น owner)

**Response 200**
```json
{ "message": "Conversation deleted" }
```

**Errors**
- `401` — Unauthorized
- `403` — Forbidden (ไม่ใช่ owner)
- `404` — Conversation not found

---

## Payments

> ทุก endpoint ในหมวดนี้ต้อง login ก่อน ยกเว้น `/payments/webhook`

### POST /payments/charge
สร้าง PromptPay QR สำหรับชำระเงินซื้อ credits

**Auth** — cookie อัตโนมัติ

**Request Body**
```json
{ "credits": 100 }
```

ค่า `credits` ที่รองรับ:

| credits | ราคา (THB) |
|---|---|
| 100 | ฿29 |
| 500 | ฿129 |
| 1,000 | ฿239 |
| 5,000 | ฿999 |

**Response 200**
```json
{
  "chargeId": "chrg_test_xxx",
  "qrUrl": "https://...",
  "amount": 29,
  "credits": 100
}
```

**Errors**
- `400` — credits ไม่อยู่ใน package list
- `401` — Unauthorized
- `500` — Omise API error

---

### GET /payments/charge/:chargeId/status
ตรวจสอบสถานะ — frontend poll ทุก 3 วินาที (ต้องเป็น owner ของ order)

**Response 200**
```json
{ "status": "PENDING" | "PAID" | "FAILED", "credits": 100 }
```

**Errors**
- `401` — Unauthorized
- `403` — Forbidden
- `404` — Order not found

---

### GET /payments/orders
ดูประวัติการซื้อ credits ทั้งหมด เรียงจากใหม่ไปเก่า

**Response 200**
```json
[{ "id": "uuid", "credits": 100, "amount": 2900, "status": "PAID", "createdAt": "ISO8601" }]
```

> `amount` หน่วย satang (THB × 100)

**Errors**
- `401` — Unauthorized

---

### POST /payments/webhook
รับ event จาก Omise — **ไม่ต้อง auth**

Backend verify โดยดึง charge จาก Omise API โดยตรง แล้วเติม credits อัตโนมัติถ้า `status === 'successful'`
