# Payment System — MydAIHub

ระบบชำระเงินซื้อ Credits ผ่าน **Omise + PromptPay QR**

---

## สถาปัตยกรรม

```
User กด Purchase
  → POST /payments/charge          สร้าง Omise charge + บันทึก Order ใน DB (PENDING)
  → แสดง QR Code + เริ่ม Polling

User สแกน QR / กด Simulate (dev)
  → ทุก 3 วินาที: GET /payments/charge/:id/status
      → ถ้า PENDING   → Omise API ยัง pending → คืน PENDING
      → ถ้า PAID      → คืน PAID ทันที (ไม่ call Omise ซ้ำ)
      → ถ้า successful (จาก Omise) → transaction: Order = PAID, credits += N

Production path (เพิ่มเติม):
  Omise → POST /payments/webhook   ยิงทันทีที่ charge complete
            → ดึง charge จาก Omise โดยตรง (verify)
            → transaction: Order = PAID, credits += N
```

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/payments/payment.service.ts` | Business logic — createCharge, getChargeStatus, handleWebhook, devCompleteCharge |
| `src/payments/payment.controller.ts` | HTTP routes |
| `src/payments/payment.module.ts` | NestJS module registration |
| `src/payments/dto/create-charge.dto.ts` | DTO validation + PACKAGES map |
| `prisma/schema.prisma` | `Order` model + `OrderStatus` enum |
| `frontend/credits.html` | UI — package grid, QR modal |
| `frontend/src/credits.ts` | Frontend logic — polling, countdown, simulate button |
| `frontend/src/credits.css` | Styles — QR modal, status dot |

---

## Package Pricing

| Credits | ราคา (THB) | amount ที่ส่ง Omise (satang) |
|---|---|---|
| 100 | ฿29 | 2,900 |
| 500 | ฿129 | 12,900 |
| 1,000 | ฿239 | 23,900 |
| 5,000 | ฿999 | 99,900 |

แก้ราคาได้ที่ `src/payments/dto/create-charge.dto.ts` → `PACKAGES`

---

## Dev-only: Simulate Payment

Omise sandbox PromptPay **ไม่เปลี่ยน status** เมื่อกด "Mark as paid" ใน dashboard เพราะ sandbox ต้องการ webhook delivery จริงเพื่อ trigger status change

### วิธีเทส development

1. กด Purchase บนหน้า Credits
2. QR modal จะขึ้นมาพร้อมปุ่ม **"⚡ Simulate Payment (Dev only)"** (เห็นเฉพาะเมื่อ `VITE_API_URL` มี `localhost` หรือ `127.0.0.1`)
3. กดปุ่มนั้น → เรียก `POST /payments/dev/complete/:chargeId`
4. Backend mark Order เป็น PAID + increment credits ตรงๆ โดยไม่ผ่าน Omise
5. Polling 3 วินาทีถัดไปจะ detect `PAID` และอัปเดต UI

### Endpoint ที่เกี่ยวข้อง

```
POST /payments/dev/complete/:chargeId
```

- **ไม่ต้อง auth** (ใช้ `@UseGuards()` ล้าง class-level guard)
- **blocked ใน production** — throw `403 ForbiddenException` ทันทีถ้า `NODE_ENV === 'production'`
- มีเฉพาะ non-production environment เท่านั้น

---

## สิ่งที่ต้องแก้ก่อนขึ้น Production

### 🔴 Critical — ต้องทำก่อน go-live

#### 1. เปลี่ยนจาก Sandbox keys → Live keys

ใน Railway Backend environment variables:

```
OMISE_SECRET_KEY=skey_live_xxxxxxxxxxxx     # เดิม: skey_test_xxx
OMISE_PUBLIC_KEY=pkey_live_xxxxxxxxxxxx     # เดิม: pkey_test_xxx
```

ดู live keys ได้ที่ **Omise Dashboard → Settings → Keys**

> ⚠️ Live keys หัก/รับเงินจริง — ทดสอบด้วย sandbox ให้ครบก่อนเปลี่ยน

---

#### 2. ตั้งค่า Omise Webhook URL

Webhook คือช่องทางหลักที่ production ใช้ detect payment — polling คือ fallback เท่านั้น

**ขั้นตอน:**
1. Omise Dashboard → **Webhooks** → เพิ่ม URL ใหม่
2. URL: `https://<backend-railway-domain>/payments/webhook`
3. เลือก event: **`charge.complete`**
4. บันทึก

**ทดสอบ webhook:** Omise Dashboard → Webhooks → กด **"Send test event"**

---

#### 3. เพิ่ม Omise Webhook Signature Verification

ปัจจุบัน webhook endpoint **ไม่ verify** ว่า request มาจาก Omise จริง — ใครก็ POST ได้

**แนวทางแก้ไข:**

Omise ส่ง `Omise-Signature` header มาทุก webhook request ให้ verify ด้วย HMAC-SHA256:

```typescript
// payment.controller.ts
import * as crypto from 'crypto';

@Post('webhook')
webhook(@Headers('omise-signature') sig: string, @RawBody() rawBody: Buffer) {
  const secret = process.env.OMISE_WEBHOOK_SECRET;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (sig !== expected) throw new ForbiddenException('Invalid webhook signature');

  const body = JSON.parse(rawBody.toString());
  return this.paymentService.handleWebhook(body);
}
```

ต้องเพิ่ม `OMISE_WEBHOOK_SECRET` ใน env (ดูค่าจาก Omise Dashboard → Webhooks)

และใน `main.ts` เปิด raw body parser สำหรับ route นี้:

```typescript
// main.ts
app.use('/payments/webhook', express.raw({ type: 'application/json' }));
```

---

#### 4. ยืนยันว่า Dev Endpoint ถูก Block

ตรวจสอบว่า `NODE_ENV=production` ถูกตั้งใน Railway Backend environment variables

เมื่อ `NODE_ENV === 'production'` endpoint `/payments/dev/complete/:chargeId` จะ throw `403 ForbiddenException` ทันที — ไม่มีผลกับ logic อื่น

---

### 🟡 High — ควรทำก่อน launch

#### 5. Rate Limit สำหรับ /payments/charge

ปัจจุบัน endpoint นี้ใช้ global throttle (60 req/min) ควร restrict ให้ต่ำกว่านั้น:

```typescript
// payment.controller.ts
@Throttle({ default: { limit: 10, ttl: 60000 } })  // 10 req/min ต่อ user
@Post('charge')
createCharge(...) { ... }
```

ป้องกัน user สร้าง charge ซ้ำเยอะเกินไปโดยเจตนา

---

#### 6. ป้องกัน Double Credit (Idempotency)

ปัจจุบันถ้า webhook ถูกยิงซ้ำ (Omise retry) หรือ polling กับ webhook เจอกันพอดี อาจเติม credits ซ้ำได้

**ป้องกันได้แล้วบางส่วน:** `getChargeStatus` และ `handleWebhook` เช็ค `order.status !== 'PENDING'` ก่อนทำ transaction — ถ้า PAID แล้วจะ skip ทันที

**เพิ่มความแน่ใจ:** ใช้ Prisma `$transaction` + `where: { chargeId, status: 'PENDING' }` แบบ conditional update:

```typescript
// ใน handleWebhook / getChargeStatus
const result = await tx.order.updateMany({
  where: { chargeId, status: 'PENDING' },  // atomic guard
  data: { status: 'PAID' },
});
if (result.count === 0) return;  // already processed
await tx.user.update({ ... });
```

---

#### 7. Omise Webhook IP Allowlist (Optional แต่แนะนำ)

Omise ส่ง webhook จาก IP range ที่กำหนด ตรวจสอบ IP เพิ่มได้ใน middleware:

- Omise IP list: ดูจาก [Omise Docs → Webhooks](https://www.omise.co/webhooks-api)
- เพิ่ม IP check ก่อน signature verification

---

### 🟢 Medium — ปรับปรุงระยะยาว

#### 8. Webhook Retry & Dead Letter Handling

ถ้า backend ตอบ non-2xx Omise จะ retry webhook หลายครั้ง ควรบันทึก webhook events ลง DB เพื่อ audit:

```prisma
model WebhookEvent {
  id         String   @id @default(uuid())
  chargeId   String
  event      String
  payload    Json
  processedAt DateTime?
  createdAt  DateTime @default(now())
}
```

#### 9. QR Expiry Enforcement ฝั่ง Backend

ปัจจุบัน countdown 15 นาทีอยู่ที่ frontend เท่านั้น Omise expire charge ที่ 15 นาทีอยู่แล้ว แต่ควรเพิ่ม cron job ใน backend ที่ mark Order เป็น FAILED เมื่อ `createdAt > 15 นาที` และ `status = PENDING`:

```typescript
// ใน payment.service.ts หรือ cron module ใหม่
@Cron('*/5 * * * *')  // ทุก 5 นาที
async expirePendingOrders() {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  await this.prisma.order.updateMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    data: { status: 'FAILED' },
  });
}
```

#### 10. Email Receipt

ส่ง email ยืนยันเมื่อชำระเงินสำเร็จ ต้องการ email provider เพิ่ม (SendGrid, Resend, Nodemailer + SMTP)

---

## Environment Variables (Payment)

| Variable | Sandbox | Production | หมายเหตุ |
|---|---|---|---|
| `OMISE_SECRET_KEY` | `skey_test_xxx` | `skey_live_xxx` | **required** |
| `OMISE_PUBLIC_KEY` | `pkey_test_xxx` | `pkey_live_xxx` | required (ถ้าใช้ Omise.js frontend) |
| `OMISE_WEBHOOK_SECRET` | — | ค่าจาก Omise Dashboard | ใช้สำหรับ verify webhook signature |
| `NODE_ENV` | `development` | `production` | block dev endpoint |

---

## Production Go-Live Checklist

```
[ ] เปลี่ยน OMISE_SECRET_KEY และ OMISE_PUBLIC_KEY เป็น live keys ใน Railway
[ ] ตั้ง webhook URL ใน Omise Dashboard → https://<backend>/payments/webhook
[ ] ทดสอบ webhook ด้วย "Send test event" ใน Omise Dashboard
[ ] เพิ่ม webhook signature verification (ข้อ 3 ด้านบน)
[ ] ยืนยัน NODE_ENV=production ถูกตั้งใน Railway → dev endpoint จะ 403
[ ] เพิ่ม rate limit บน POST /payments/charge
[ ] ทดสอบ end-to-end ด้วย PromptPay จริง (จำนวนเล็กน้อย)
[ ] ตรวจสอบ log ใน Railway หลังทดสอบ — มองหา [PaymentService] log
```

---

## การ Monitor หลัง Production

**Log ที่ควรตรวจ (Railway Logs):**

```
[PaymentService] Omise charge chrg_xxx status: "successful" paid: true     ← polling detect
[PaymentService] Order chrg_xxx → PAID                                      ← DB update
[PaymentService] User uuid credits → 600 (+100)                             ← credits update
[PaymentService] Webhook: Order ord_xxx paid — +100 credits for user uuid   ← webhook path
```

**ถ้าเห็น log ผิดปกติ:**
- `Order not found or already PAID` — webhook retry ปกติ ไม่ใช่ bug
- `Omise retrieve failed` — Omise API down หรือ key ผิด
- `Payment confirmed but failed to update credits` — DB transaction fail — ติดต่อ support
