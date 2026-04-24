# Temporary Changes — สิ่งที่แก้ไขชั่วคราว

เอกสารนี้บันทึก **การเปลี่ยนแปลงที่ทำเพื่อความสะดวกในช่วง UAT/Testing** ซึ่งยังไม่เหมาะสมสำหรับ production จริง

---

## 1. ปุ่ม "Simulate Payment" แสดงทุก environment

**ไฟล์:** `frontend/src/credits.ts`

**สถานะปัจจุบัน (ชั่วคราว):**
```typescript
// ปุ่มแสดงเสมอ ไม่ว่าจะเป็น dev หรือ production
devBtn.classList.remove('hidden');
devBtn.onclick = () => simulatePayment(chargeId);
```

**ควรเป็นแบบนี้เมื่อพร้อม production:**
```typescript
// แสดงเฉพาะตอน dev
const isDev = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');
if (isDev) {
  devBtn.classList.remove('hidden');
  devBtn.onclick = () => simulatePayment(chargeId);
} else {
  devBtn.classList.add('hidden');
}
```

**ความเสี่ยง:** user ใน production เห็นปุ่มนี้และสามารถกดเพื่อเติม credits โดยไม่จ่ายเงินจริง

---

## 2. Endpoint `/payments/dev/complete/:chargeId` เปิดทุก environment

**ไฟล์:** `src/payments/payment.controller.ts`

**สถานะปัจจุบัน (ชั่วคราว):**
```typescript
@SkipThrottle()
@UseGuards()
@Post('dev/complete/:chargeId')
devComplete(@Param('chargeId') chargeId: string) {
  return this.paymentService.devCompleteCharge(chargeId);
}
```

**ควรเป็นแบบนี้เมื่อพร้อม production:**
```typescript
import { ForbiddenException } from '@nestjs/common';

@SkipThrottle()
@UseGuards()
@Post('dev/complete/:chargeId')
devComplete(@Param('chargeId') chargeId: string) {
  if (process.env.NODE_ENV === 'production') throw new ForbiddenException();
  return this.paymentService.devCompleteCharge(chargeId);
}
```

และเพิ่ม `ForbiddenException` กลับใน import บรรทัดแรก:
```typescript
import { Controller, Post, Get, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
```

**ความเสี่ยง:** ใครก็ตามที่รู้ `chargeId` สามารถ POST มาเพื่อเติม credits ให้ตัวเองโดยไม่จ่ายเงิน — endpoint นี้ bypass Omise ทั้งหมด

---

## 3. `OMISE_SECRET_KEY` ไม่ได้ตั้งใน Railway

**สถานะปัจจุบัน:** app ขึ้นได้เพราะ... (ยังต้องตั้ง key ใน Railway)

ถ้า `OMISE_SECRET_KEY` ไม่ได้ตั้ง app จะ crash ตอน startup ด้วย error:
```
Error: OMISE_SECRET_KEY environment variable is required
```

**วิธีแก้:** ตั้ง env var ใน Railway Backend service:
```
OMISE_SECRET_KEY = skey_test_xxx   (sandbox)
OMISE_SECRET_KEY = skey_live_xxx   (production)
OMISE_PUBLIC_KEY = pkey_test_xxx
OMISE_PUBLIC_KEY = pkey_live_xxx
```

---

## Checklist ก่อนเปิด Production จริง

```
[ ] แก้ credits.ts — ซ่อนปุ่ม Simulate Payment ใน production (ข้อ 1)
[ ] แก้ payment.controller.ts — block endpoint dev/complete ใน production (ข้อ 2)
[ ] ตั้ง OMISE_SECRET_KEY และ OMISE_PUBLIC_KEY ใน Railway (ข้อ 3)
[ ] เปลี่ยน Omise key จาก sandbox เป็น live key
[ ] ตั้ง webhook URL ใน Omise Dashboard (ดู docs/payments.md)
```
