import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

const MIN_CHUNK_SIZE = 6;
const MAX_CHUNK_SIZE = 30;
const INITIAL_CHUNK_SIZE = 10; // trigger chunk แรกที่ยังไม่มี summary เลย
const TOPIC_SHIFT_THRESHOLD = 0.72;
const SUMMARY_MODEL = 'openai/gpt-4o-mini';
const EMBEDDING_MODEL = 'jina-embeddings-v3';
const EMBEDDING_DIMENSIONS = 512;

const embeddingClient = process.env.JINA_API_KEY
  ? new OpenAI({
      baseURL: 'https://api.jina.ai/v1',
      apiKey: process.env.JINA_API_KEY,
    })
  : null;

const summaryClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
    'X-Title': 'MydAIHub',
  },
});

@Injectable()
export class SummaryService {
  private readonly logger = new Logger(SummaryService.name);

  constructor(private prisma: PrismaService) {}

  private async embedText(text: string): Promise<number[] | null> {
    if (!embeddingClient) return null;
    try {
      const res = await embeddingClient.embeddings.create({
        model: EMBEDDING_MODEL,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      return res.data[0].embedding;
    } catch (err: any) {
      this.logger.error('Embedding error', err?.message);
      return null;
    }
  }

  async searchRelevant(userId: string, queryText: string, limit = 3): Promise<string[]> {
    const embedding = await this.embedText(queryText);
    if (!embedding) return [];
    const vectorStr = `[${embedding.join(',')}]`;
    try {
      const rows = await this.prisma.$queryRaw<{ content: string }[]>`
        SELECT content
        FROM "ConversationSummary"
        WHERE "userId" = ${userId}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `;
      return rows.map(r => r.content);
    } catch (err: any) {
      this.logger.error('Vector search error', err?.message);
      return [];
    }
  }

  async checkAndSummarize(conversationId: string, userId: string, reply: string): Promise<void> {
    const replyEmbedding = await this.embedText(reply);
    if (!replyEmbedding) return;

    const vectorStr = `[${replyEmbedding.join(',')}]`;

    const [lastSummary, totalCount] = await Promise.all([
      this.prisma.$queryRaw<{ toIndex: number; similarity: number }[]>`
        SELECT "toIndex", 1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM "ConversationSummary"
        WHERE "conversationId" = ${conversationId}
        ORDER BY "toIndex" DESC
        LIMIT 1
      `,
      this.prisma.message.count({ where: { conversationId } }),
    ]);

    const lastToIndex = lastSummary.length > 0 ? Number(lastSummary[0].toIndex) : 0;
    const messagesSinceLast = totalCount - lastToIndex;

    if (messagesSinceLast < MIN_CHUNK_SIZE) return;

    const isFirstChunk = lastSummary.length === 0;
    const topicShifted = !isFirstChunk && lastSummary[0].similarity < TOPIC_SHIFT_THRESHOLD;
    const forceTrigger = messagesSinceLast >= MAX_CHUNK_SIZE;
    const initialTrigger = isFirstChunk && messagesSinceLast >= INITIAL_CHUNK_SIZE;

    if (!topicShifted && !forceTrigger && !initialTrigger) return;

    const reason = forceTrigger ? 'max-chunk' : initialTrigger ? 'initial' : 'topic-shift';

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      skip: lastToIndex,
      select: { role: true, content: true },
    });

    let summaryText: string;
    try {
      const res = await summaryClient.chat.completions.create({
        model: SUMMARY_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: 'Summarize this conversation in 3-5 sentences. Preserve key topics, names, numbers, and decisions.',
          },
          {
            role: 'user',
            content: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          },
        ],
      });
      summaryText = res.choices[0]?.message?.content ?? '';
    } catch (err: any) {
      this.logger.error(`Summarization error: ${err?.message ?? err}`, err?.stack);
      return;
    }

    if (!summaryText) return;

    const summaryEmbedding = await this.embedText(summaryText);
    if (!summaryEmbedding) return;

    const summaryVectorStr = `[${summaryEmbedding.join(',')}]`;

    await this.prisma.$executeRaw`
      INSERT INTO "ConversationSummary"
        (id, "userId", "conversationId", "fromIndex", "toIndex", content, embedding, "createdAt")
      VALUES
        (gen_random_uuid(), ${userId}, ${conversationId}, ${lastToIndex}, ${totalCount}, ${summaryText}, ${summaryVectorStr}::vector, NOW())
    `;

    this.logger.log(`Summary saved [${reason}]: conv=${conversationId} msgs=${lastToIndex}-${totalCount} similarity=${lastSummary[0]?.similarity?.toFixed(3) ?? 'n/a'}`);
  }
}
