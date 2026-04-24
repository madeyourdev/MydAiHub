# Vector Memory — Long-term AI Context

แผนการเพิ่ม semantic memory ให้ AI จำบริบทได้ไกลกว่า sliding window เดิม

**สถานะ:** วางแผนไว้ — ยังไม่ implement  
**แนวทางที่เลือก:** Sliding Window + Summary Memory

---

## ปัญหาของระบบปัจจุบัน

`HISTORY_LIMIT = 20` ใน `src/chat/chat.service.ts` — AI เห็นแค่ 20 message ล่าสุดเสมอ

- message เก่ากว่านั้นหายไปจาก context ถาวร
- ถ้า user ถามเรื่องที่คุยไว้เมื่อ 50 message ก่อน AI ไม่รู้
- ไม่มี memory ข้าม conversation

---

## Architecture รวม

```
┌─────────────────────────────────────────────────────────┐
│                    PostgreSQL (เหมือนเดิม)                │
│   เก็บทุก message ครบ ไม่มีอะไรหาย                          │
└──────────────────┬──────────────────────────────────────┘
                   │ ทุก 20 messages
                   ▼
┌─────────────────────────────────────────────────────────┐
│              Background Summarization Job               │
│   OpenRouter สรุป 20 messages → summary text             │
│   OpenAI embed summary → vector 512 dimensions          │
│   บันทึกลง ConversationSummary table                      │
└──────────────────┬──────────────────────────────────────┘
                   │ stored
                   ▼
┌─────────────────────────────────────────────────────────┐
│              pgvector (Supabase)                        │
│   เก็บเฉพาะ summary embeddings — น้อยมาก                  │
│   1,000 messages = 50 vectors เท่านั้น                     │
└──────────────────┬──────────────────────────────────────┘
                   │ search ตอน user ส่ง message
                   ▼

User ส่ง message
├── embed query → search vector → top-3 summaries ที่เกี่ยวข้อง
├── PostgreSQL → 10 message ล่าสุด (ลดจาก 20 เดิม)
└── ประกอบ prompt:
      [system prompt]
      [Relevant past context: summary1, summary2, summary3]
      [Recent: 10 messages ล่าสุด]
      [current message]
    → OpenRouter → reply
```

PostgreSQL ยังเก็บทุกอย่างเหมือนเดิม ไม่มีอะไรถูกลบ  
Vector DB เป็นแค่ "index" สำหรับค้นหาความหมาย

---

## Tools ที่ใช้

| Tool | ใช้ทำอะไร | มีอยู่แล้ว? |
|---|---|---|
| PostgreSQL (Supabase) | เก็บ message ทั้งหมด | ✅ |
| pgvector (Supabase) | เก็บ summary embeddings | ต้องเปิด extension |
| OpenRouter | chat AI + summarization job | ✅ |
| OpenAI embedding API | แปลง summary → vector | ต้องเพิ่ม key |
| Prisma | ORM + raw SQL สำหรับ vector query | ✅ |

---

## ขั้นตอน Implementation

### 1. Supabase — เปิด pgvector extension
```sql
-- Supabase Dashboard → SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. Prisma Schema — เพิ่ม 1 table
```prisma
model ConversationSummary {
  id             String   @id @default(uuid())
  userId         String
  conversationId String
  fromIndex      Int
  toIndex        Int
  content        String
  embedding      Unsupported("vector(512)")
  createdAt      DateTime @default(now())

  user         User         @relation(fields: [userId], references: [id])
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

> Prisma ไม่ support `vector` type โดยตรง — ต้องใช้ `Unsupported("vector(512)")`  
> และใช้ `$queryRaw` สำหรับ insert/search

รันหลัง schema เพิ่ม:
```bash
npx prisma migrate dev --name add-conversation-summary
```

เพิ่ม IVFFlat index ใน migration file ก่อน apply:
```sql
CREATE INDEX ON "ConversationSummary"
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

### 3. npm packages
```bash
npm install openai   # ใช้เฉพาะ embedding — ไม่กระทบ OpenRouter ที่มีอยู่
```

### 4. Environment Variables ที่ต้องเพิ่ม
```
OPENAI_API_KEY=sk-proj-xxx   # สำหรับ embedding เท่านั้น ไม่ใช่ chat
```

เพิ่มใน `.env.example` และ Railway Backend service

### 5. สร้าง SummaryModule
```
src/summary/
  summary.module.ts
  summary.service.ts
```

**SummaryService — methods ที่ต้องมี:**

| Method | หน้าที่ |
|---|---|
| `maybeSummarize(conversationId, userId)` | เช็คจำนวน message ถ้าครบ 20 → trigger summarize (ไม่ await) |
| `generateSummary(messages[])` | เรียก OpenRouter สรุป 20 messages เป็น text |
| `embedAndSave(summary, metadata)` | embed ด้วย OpenAI → บันทึก vector ลง DB |
| `searchRelevant(userId, queryText, limit)` | embed query → cosine similarity search |

**searchRelevant ใช้ raw SQL:**
```sql
SELECT content, 1 - (embedding <=> $1::vector) AS similarity
FROM "ConversationSummary"
WHERE "userId" = $2
ORDER BY embedding <=> $1::vector
LIMIT $3;
```

### 6. แก้ ChatService.sendMessage()

```typescript
// ก่อนเรียก AI — เพิ่ม semantic retrieval
const memories = await summaryService.searchRelevant(userId, message, 3);

// ประกอบ prompt
const messages = [
  { role: 'system', content: SYSTEM_PROMPT },
  // inject summaries เป็น context
  ...(memories.length ? [{
    role: 'system',
    content: `Relevant context from past conversations:\n${memories.map(m => m.content).join('\n\n')}`
  }] : []),
  ...recentHistory,   // 10 message ล่าสุด
  { role: 'user', content: message },
];

// หลัง save message — background summarization (ไม่ await)
summaryService.maybeSummarize(conversation.id, userId);
```

ลด `HISTORY_LIMIT` จาก 20 → 10

### 7. อัปเดต AppModule
```typescript
import { SummaryModule } from './summary/summary.module';

@Module({
  imports: [
    ...
    SummaryModule,
  ],
})
```

---

## ข้อดี

**Performance**
- AI มี long-term memory ข้าม conversation ได้
- Context window ถูกใช้อย่างมีประสิทธิภาพ — summary กระชับกว่า raw messages
- Vector น้อยมาก (1 ต่อ 20 messages) → search < 10ms

**Cost**
- Embedding เรียกแค่ตอน summarize ไม่ใช่ทุก message
- 1,000 messages ≈ 50 vectors ≈ ค่า embedding ไม่ถึง $0.001
- Summarize ใช้ model ถูกๆ เช่น `mistral-7b-instruct` ได้

**Latency**
- ไม่เพิ่ม latency บน critical path เลย — summarize เป็น background ทั้งหมด
- Search vector เพิ่ม < 10ms ต่อ request

**Architecture**
- PostgreSQL ยังเก็บครบ ไม่มีข้อมูลหาย
- Summarization fail → graceful — AI ใช้แค่ recent messages ต่อไปได้

---

## ข้อเสีย

**Memory ไม่ real-time**
- 19 message แรกของแต่ละ chunk ยังไม่มี summary → long-term memory ยังไม่ active
- Summary job run ที่ message 20, 40, 60 — ช่องว่างระหว่างนั้นยังไม่ index

**Summary อาจพลาด detail**
- ถ้า user บอก specific data (ตัวเลข, ชื่อ) summary อาจกระชับเกินจนหาย
- แก้ได้ด้วย summarization prompt ที่เน้น key facts

**Complexity เพิ่ม**
- มี module เพิ่ม + background job + raw SQL สำหรับ vector
- ถ้า OpenAI embedding API down → summary chunk นั้นไม่ถูก index จนกว่าจะ retry

---

## เปรียบเทียบกับแนวทางอื่น

|                         |Summary Memory |    Per-message Embedding     | แค่เพิ่ม HISTORY_LIMIT  |
|                         |---------------|------------------------------|----------------------|
|       Latency เพิ่ม       |      0ms      |          0ms (async)         |          0ms         |
|       Vector ใน DB      |     น้อยมาก    |      เยอะ (ทุก message)       |          ไม่มี         |
|           Cost          |     ต่ำมาก     |            ปานกลาง           |          $0          |
|       Recall แม่นยำ      |   ปานกลาง-ดี   |              ดีมาก            | เฉพาะ N message ล่าสุด |
| Memory ข้าม conversation |       ✅      |              ✅               |          ❌          |
|        Complexity.      |    ปานกลาง    |           ปานกลาง            |          ต่ำ          |
|       **เหมาะกับ**       | **app ขนาดนี้** | app ที่ต้องการ recall ละเอียดมาก |   MVP / ทดสอบ.       |

---

## แผน Implementation แบบ Phase

```
Phase 1 — ทำทันที (ไม่มีค่าใช้จ่ายเพิ่ม)
  แก้ HISTORY_LIMIT: 20 → 40
  ได้ผล 60% ของ vector โดยไม่ต้องทำอะไรเพิ่ม

Phase 2 — Summary Memory
  เปิด pgvector + เพิ่ม schema + SummaryModule + แก้ ChatService
  ใช้เวลา implement ~1-2 วัน

Phase 3 — Per-message async embedding (optional)
  เพิ่มหลัง Phase 2 ถ้าต้องการ recall ละเอียดกว่า summary
```

---

## ไฟล์ที่ต้องแก้เมื่อ implement

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `prisma/schema.prisma` | เพิ่ม `ConversationSummary` model + relation ใน `User`, `Conversation` |
| `src/summary/` | สร้าง module ใหม่ทั้งหมด |
| `src/chat/chat.service.ts` | inject SummaryService, เพิ่ม retrieval ก่อน AI, trigger summarize หลัง save, ลด HISTORY_LIMIT |
| `src/app.module.ts` | import SummaryModule |
| `.env.example` | เพิ่ม `OPENAI_API_KEY` |
| `CLAUDE.md` | อัปเดต env vars table |
| `docs/api.md` | เพิ่ม endpoint ถ้ามี semantic search endpoint ในอนาคต |
