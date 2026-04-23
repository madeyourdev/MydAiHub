# Chat AI Response Flow

## Overview

ระบบ chat ทำงานแบบ **multi-turn conversation** — ผู้ใช้สนทนาต่อเนื่องได้หลาย session บันทึกประวัติลง DB ทุก message แต่ละ message หักเครดิต 1 หน่วย ทั้งหมดจัดการฝั่ง backend เท่านั้น

## AI Provider Roadmap

| Phase | Provider | เหตุผล |
|---|---|---|
| **ปัจจุบัน** | **Groq** | ฟรี ไม่ต้องใส่บัตร เร็วมาก เหมาะสำหรับ dev/test |
| อนาคต | **OpenRouter** | รองรับหลาย model จาก provider เดียว ยืดหยุ่นกว่า จ่ายตาม usage |

ทั้ง Groq และ OpenRouter ใช้ **OpenAI-compatible API format** — เปลี่ยน provider แค่สลับ `baseURL` + `apiKey` ใน env โค้ดที่เหลือไม่ต้องแตะ

---

## Sequence Diagram

```
Browser (chat.ts)          Backend (NestJS)         Groq API (→ OpenRouter)
      │                          │                          │
      │  POST /chat/message      │                          │
      │  { message, model,       │                          │
      │    conversationId? }     │                          │
      │─────────────────────────>│                          │
      │                          │                          │
      │                   JwtAuthGuard                      │
      │                   (validate cookie)                 │
      │                          │                          │
      │                   findUser(userId)                  │
      │                   check credits >= 1                │
      │                          │                          │
      │                   get/create Conversation           │
      │                   load last 20 messages             │
      │                          │                          │
      │                          │  chat.completions.create()
      │                          │  { model, history+msg }  │
      │                          │─────────────────────────>│
      │                          │                          │
      │                          │  { choices[0].message }  │
      │                          │<─────────────────────────│
      │                          │                          │
      │                   $transaction:                     │
      │                   save user msg                     │
      │                   save assistant msg                │
      │                   UPDATE credits - 1                │
      │                          │                          │
      │  { reply, credits,       │                          │
      │    conversationId }      │                          │
      │<─────────────────────────│                          │
      │                          │                          │
```

---

## Components

| Layer | ไฟล์ | หน้าที่ |
|---|---|---|
| Frontend | `frontend/src/chat.ts` | รับ input, แสดง conversation list, render history, update credits |
| Controller | `src/chat/chat.controller.ts` | validate DTO, extract userId จาก JWT |
| Service | `src/chat/chat.service.ts` | ตรวจ credits, จัดการ conversation, เรียก Groq, หัก credits, cron |
| Guard | `src/auth/guards/jwt-auth.guard.ts` | ตรวจ JWT cookie ก่อนเข้า endpoint ทุกครั้ง |
| openai SDK | `openai` (npm package) | OpenAI-compatible client — ใช้ได้กับ Groq และ OpenRouter โดยไม่ต้องเปลี่ยนโค้ด |
| @nestjs/schedule | ScheduleModule | Cron job ลบ conversation ที่หมดอายุทุกคืน 02:00 |

---

## Step-by-Step Flow

### 1. Frontend — โหลด Conversation List

ตอนเปิดหน้า chat ระบบโหลด conversation ทั้งหมดของ user และเลือก conversation ล่าสุดอัตโนมัติ

```typescript
// GET /chat/conversations → แสดงรายการใน sidebar
// GET /chat/conversations/:id/messages → โหลด history ใน chat window
```

### 2. Frontend — ส่ง Request

```typescript
const res = await fetch(`${API_URL}/chat/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    message: text,
    model: modelSelect.value,
    conversationId: currentConversationId ?? undefined,  // null = สร้าง conversation ใหม่
  }),
});
```

### 3. Guard — ตรวจ JWT

`JwtAuthGuard` อ่าน cookie `access_token` → verify → inject `req.user = { userId, email, role }`

ถ้า token หมดอายุหรือไม่มี → `401 Unauthorized` ทันที

### 4. Service — ตรวจ Credits

```typescript
const user = await this.prisma.user.findUnique({ where: { id: userId } });
if (!user) throw new BadRequestException('User not found');
if (user.credits < CREDIT_COST) throw new BadRequestException('Insufficient credits');
```

ถ้าเครดิตไม่พอ → `400 Insufficient credits` (ไม่เรียก Groq)

### 5. Service — Get or Create Conversation

```typescript
if (conversationId) {
  // โหลด conversation เดิม — ตรวจว่าเป็น owner
} else {
  // สร้างใหม่ โดย auto-title จาก message แรก (ตัดที่ 50 ตัวอักษร)
  conversation = await this.prisma.conversation.create({ data: { userId, title } });
}
```

### 6. Service — โหลด History + เรียก Groq

```typescript
const history = await this.prisma.message.findMany({
  where: { conversationId: conversation.id },
  orderBy: { createdAt: 'asc' },
  take: 20,  // จำกัดไว้ 20 messages เพื่อไม่ให้ request หนักเกิน
});

const resolvedModel = model || user.aiModel || DEFAULT_MODEL;

const response = await client.chat.completions.create({
  model: resolvedModel,
  max_tokens: 1024,
  messages: [
    { role: 'system', content: 'You are a helpful AI assistant.' },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ],
});
```

ถ้า Groq error → `500 Failed to get response from AI` (เครดิตไม่ถูกหัก)

### 7. Service — บันทึก + หัก Credits (Atomic Transaction)

```typescript
await this.prisma.$transaction([
  this.prisma.message.create({ data: { conversationId, role: 'user', content: message, model } }),
  this.prisma.message.create({ data: { conversationId, role: 'assistant', content: reply, model, inputTokens, outputTokens } }),
  this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  this.prisma.user.update({ where: { id: userId }, data: { credits: { decrement: CREDIT_COST } } }),
]);
```

ทั้ง 4 operations สำเร็จพร้อมกัน หรือ rollback พร้อมกัน — เครดิตไม่หักถ้า save message ล้มเหลว

### 8. Frontend — แสดงผลและอัพเดท UI

```typescript
// แสดง reply
renderMessage({ role: 'assistant', content: data.reply });
// อัพเดท credits badge
document.getElementById('creditsCount').textContent = data.credits;
// อัพเดท conversation list (title + last message preview)
currentConversationId = data.conversationId;
```

---

## Model Selection — Admin & User

| ลำดับ | Source | เงื่อนไข |
|---|---|---|
| 1 | `dto.model` (frontend dropdown) | ถ้า user เลือก → ใช้ตามที่ user เลือก |
| 2 | `user.aiModel` (DB — admin ตั้ง) | fallback ถ้า frontend ไม่ส่งมา |
| 3 | `DEFAULT_MODEL` = `llama-3.3-70b-versatile` | fallback สุดท้าย |

**Frontend behavior:** ตอน page load จะ pre-select dropdown ตาม `user.aiModel` ที่ admin ตั้งไว้ — user ยังเปลี่ยนเองได้ใน session นั้น

---

## Models ที่รองรับ (Groq — ฟรีทั้งหมด)

| Model ID | ขนาด | จุดเด่น |
|---|---|---|
| `llama-3.3-70b-versatile` | 70B | **default** — คุณภาพดีสุดในฟรี |
| `llama-3.1-70b-versatile` | 70B | Llama 3.1 รุ่นก่อนหน้า |
| `llama-3.1-8b-instant` | 8B | เร็วสุด เหมาะ simple task |
| `llama3-70b-8192` | 70B | Llama 3 รุ่นเก่า |
| `llama3-8b-8192` | 8B | Llama 3 เร็ว |
| `gemma2-9b-it` | 9B | Google Gemma 2 |
| `gemma-7b-it` | 7B | Google Gemma รุ่นเก่า |
| `mixtral-8x7b-32768` | 8x7B MoE | context window ยาวสุด 32k tokens |

ดู list ล่าสุดได้ที่ `console.groq.com/docs/models`

---

## Auto-Delete Conversations (Cron)

```typescript
// ทำงานทุกคืน 02:00 — ลบ conversation ที่ไม่มีการใช้งานเกิน 7 วัน
@Cron(CronExpression.EVERY_DAY_AT_2AM)
async handleExpiredConversations() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  await this.prisma.conversation.deleteMany({
    where: { updatedAt: { lt: cutoff } },
  });
}
```

- ใช้ `updatedAt` เป็นเกณฑ์ — conversation ที่ยังคุยอยู่จะไม่ถูกลบแม้จะเก่า
- ลบเมื่อ **ไม่มีกิจกรรมเกิน 7 วัน** (ไม่มี message ใหม่)
- Messages ทั้งหมดในนั้นถูกลบตาม `onDelete: Cascade` อัตโนมัติ

---

## Error Handling

| สถานการณ์ | HTTP Status | ข้อความ | เครดิตถูกหัก |
|---|---|---|---|
| ไม่มี token / หมดอายุ | 401 | Unauthorized | ❌ |
| message ว่าง | 400 | Message cannot be empty | ❌ |
| เครดิตไม่พอ | 400 | Insufficient credits | ❌ |
| User ไม่พบใน DB | 400 | User not found | ❌ |
| Conversation ไม่พบ | 404 | Conversation not found | ❌ |
| ไม่ใช่ owner ของ conversation | 403 | Forbidden | ❌ |
| Groq API error | 500 | Failed to get response from AI | ❌ |
| สำเร็จ | 200 | — | ✅ |

---

## Request / Response Shape

**POST /chat/message**
```http
POST /chat/message
Cookie: access_token=<JWT>
Content-Type: application/json

{
  "message": "สวัสดี ช่วยอธิบาย NestJS หน่อย",
  "model": "llama-3.3-70b-versatile",
  "conversationId": "uuid (optional)"
}
```

```json
{
  "reply": "NestJS คือ framework สำหรับสร้าง Node.js server...",
  "credits": 99,
  "conversationId": "uuid"
}
```

---

## สถานะ Feature

| Feature | สถานะ |
|---|---|
| Single-turn messaging | ✅ |
| Conversation history (multi-turn) | ✅ |
| Token tracking (inputTokens, outputTokens) | ✅ เก็บใน DB แล้ว |
| Auto-delete expired conversations (cron) | ✅ ทุกคืน 02:00 |
| Admin กำหนด default model ให้ user | ✅ |
| User override model ต่อ session | ✅ |
| Streaming (SSE/WebSocket) | ❌ อนาคต |
| System prompt กำหนดได้ | ❌ hardcoded ใน service |

---

## การเปลี่ยนจาก Groq → OpenRouter

เมื่อพร้อม ทำแค่ 3 ขั้นตอน:

1. เพิ่ม `OPENROUTER_API_KEY` ใน `.env` และ Railway
2. แก้ `src/chat/chat.service.ts` เปลี่ยน 2 บรรทัด

```typescript
const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',  // เดิม: api.groq.com/openai/v1
  apiKey: process.env.OPENROUTER_API_KEY,   // เดิม: GROQ_API_KEY
});
```

3. อัพเดท model ID ใน `chat.html` และ `admin.html` dropdown ให้ตรงกับ OpenRouter model IDs
