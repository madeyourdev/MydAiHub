import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

const EXTRACT_MODEL = 'openai/gpt-4o-mini';
const IDLE_HOURS = 1;
const MIN_MESSAGES = 4;

const extractClient = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
    'X-Title': 'MydAIHub',
  },
});

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(private prisma: PrismaService) {}

  async getUserFacts(userId: string): Promise<string[]> {
    const memories = await this.prisma.userMemory.findMany({
      where: { userId },
      select: { fact: true },
      orderBy: { createdAt: 'asc' },
    });
    return memories.map(m => m.fact);
  }

  async getMemoriesWithId(userId: string): Promise<{ id: string; fact: string; createdAt: Date }[]> {
    return this.prisma.userMemory.findMany({
      where: { userId },
      select: { id: true, fact: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async deleteFact(id: string, userId: string): Promise<void> {
    await this.prisma.userMemory.deleteMany({ where: { id, userId } });
  }

  async extractFacts(conversationId: string, userId: string): Promise<void> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });

    if (messages.length < MIN_MESSAGES) return;

    const conversationText = messages
      .map(m => `${m.role}: ${m.content}`)
      .join('\n');

    let facts: string[];
    try {
      const res = await extractClient.chat.completions.create({
        model: EXTRACT_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'system',
            content: `Extract key facts about the USER from this conversation.
Return ONLY a JSON array of short strings (Thai or English).
Focus on: name, job, projects, preferences, technical stack, goals, decisions made.
Only include facts the user explicitly stated. Be concise. Max 10 facts.
Example: ["ชื่อ Tee", "ทำ startup ชื่อ MydAIHub", "ใช้ NestJS + Vite"]
Return only the JSON array, no other text.`,
          },
          { role: 'user', content: conversationText },
        ],
      });

      const content = res.choices[0]?.message?.content?.trim() ?? '[]';
      facts = JSON.parse(content);
      if (!Array.isArray(facts)) return;
      facts = facts.filter(f => typeof f === 'string' && f.trim());
    } catch (err: any) {
      this.logger.error('Fact extraction error', err?.message);
      return;
    }

    if (!facts.length) return;

    await this.prisma.userMemory.deleteMany({ where: { source: conversationId } });
    await this.prisma.userMemory.createMany({
      data: facts.map(fact => ({ userId, fact, source: conversationId })),
    });

    this.logger.log(`Extracted ${facts.length} facts from conversation ${conversationId}`);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleIdleConversations(): Promise<void> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - IDLE_HOURS);

    const conversations = await this.prisma.conversation.findMany({
      where: { updatedAt: { lt: cutoff } },
      select: { id: true, userId: true, updatedAt: true },
      take: 50,
    });

    for (const conv of conversations) {
      const latestMemory = await this.prisma.userMemory.findFirst({
        where: { source: conv.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      const needsExtract = !latestMemory || latestMemory.createdAt < conv.updatedAt;
      if (needsExtract) {
        await this.extractFacts(conv.id, conv.userId);
      }
    }
  }
}
